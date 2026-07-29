import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';
import {
  materializeRetailFitoutMasterCatalogTemplateData,
  materializeRetailFitoutV2TemplateData,
  validateMasterCatalogTemplateData,
  validateMasterCatalogWeightMetadata,
  selectDefaultScopeTemplate,
  RETAIL_FITOUT_V2_FAMILY,
  RETAIL_FITOUT_V2_FAMILY_ID,
  RETAIL_FITOUT_V2_TEMPLATE_ID,
  RETAIL_FITOUT_V2_WP_ID_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID,
} from '../../src/domains/construction/templates/versionedScopeTemplate.js';
import { buildMasterCatalogProgressTemplate } from '../../src/core/projects/weights/buildMasterCatalogProgressTemplate.js';
import { computeMasterCatalogEffectiveWeights } from '../../src/engines/masterCatalogWeightEngine.js';

const DB_URL = process.env.CERT_DB_URL;
assertLocalTarget({
  apiUrl: process.env.CERT_SUPABASE_URL,
  dbUrl: DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(__dirname, '..', '..', 'src', 'migrations', '044_master_catalog_weight_calibration.sql');
const psqlPath = 'C:\\Program Files\\PostgreSQL\\100\\bin\\psql.exe';
const psqlEnv = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` };

function psql(sql) {
  return execFileSync(psqlPath, [DB_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql], {
    encoding: 'utf8',
    env: psqlEnv,
  }).trim();
}
function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canon(value[key])]));
  }
  return value;
}
function equalJson(a, b) {
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

let pass = 0;
let fail = 0;
function check(label, condition, detail = '') {
  if (condition) { pass += 1; console.log(`  OK ${label}`); }
  else { fail += 1; console.error(`  FAIL ${label}${detail ? ` -- ${detail}` : ''}`); }
}

const row = JSON.parse(psql(`
  SELECT json_build_object(
    'id', id,
    'family', family,
    'familyId', family_id,
    'companyId', company_id,
    'version', version,
    'isActive', is_active,
    'data', data,
    'projectReferences', (SELECT count(*) FROM public.projects WHERE template_id = templates.id)
  )::text
  FROM public.templates
  WHERE id = '${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}';
`));
const canonicalData = materializeRetailFitoutMasterCatalogTemplateData();
const migration = readFileSync(migrationPath, 'utf8');
const migrationPayload = JSON.parse(
  migration.match(/\$weighted_catalog\$\r?\n([\s\S]+?)\r?\n\$weighted_catalog\$::jsonb/)?.[1] ?? 'null',
);

console.log('\n1. Persisted candidate identity and three-way equivalence');
check('candidate identity exact and inactive',
  row.id === RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID
  && row.family === RETAIL_FITOUT_V2_FAMILY
  && row.familyId === RETAIL_FITOUT_V2_FAMILY_ID
  && row.companyId === null
  && row.version === 2
  && row.data.schemaVersion === 2
  && row.isActive === false);
check('candidate has zero project references', Number(row.projectReferences) === 0);
check('canonical source = migration finalized payload', equalJson(canonicalData, migrationPayload));
check('migration finalized payload = actual local DB row', equalJson(migrationPayload, row.data));
check('persisted candidate passes structural validation', validateMasterCatalogTemplateData(row.data).length === 0);
check('persisted candidate passes operational weight validation', validateMasterCatalogWeightMetadata(row.data).length === 0);

const categories = row.data.zones.flatMap(zone =>
  zone.categories.map(category => ({ ...category, zoneId: zone.id })));
const workPackages = categories.flatMap(category =>
  category.workPackages.map(wp => ({ ...wp, zoneId: category.zoneId, categoryId: category.id })));
const byId = new Map(workPackages.map(wp => [wp.id, wp]));
const defaultIds = row.data.defaultScope.workPackageIds;
const ineligible = workPackages.filter(wp => !wp.constructionProgressEligible);
const defaultIneligible = ineligible.filter(wp => defaultIds.includes(wp.id));

console.log('\n2. Persisted metrics and real engine');
check('persisted counts 3/26/221, eligibility 202/19, defaults 78/66/12',
  row.data.zones.length === 3
  && categories.length === 26
  && workPackages.length === 221
  && workPackages.filter(wp => wp.constructionProgressEligible).length === 202
  && ineligible.length === 19
  && defaultIds.length === 78
  && defaultIds.length - defaultIneligible.length === 66
  && defaultIneligible.length === 12);
check('persisted factors/baseEffort counts exact',
  categories.filter(c => c.categoryFactor !== undefined).length === 25
  && categories.filter(c => c.categoryFactor === undefined).length === 1
  && workPackages.filter(wp => Object.prototype.hasOwnProperty.call(wp, 'baseEffort')).length === 202
  && ineligible.every(wp => !Object.prototype.hasOwnProperty.call(wp, 'baseEffort')));

const template = buildMasterCatalogProgressTemplate({ sales: 800, boh: 150 }, { data: row.data });
const engine = computeMasterCatalogEffectiveWeights(template.workPackages, defaultIds, template.groupShares);
const sum = Object.values(engine.effectiveWeights).reduce((a, b) => a + b, 0);
const groupWeights = {};
for (const [id, weight] of Object.entries(engine.effectiveWeights)) {
  const zoneId = byId.get(id).zoneId;
  groupWeights[zoneId] = (groupWeights[zoneId] ?? 0) + weight;
}
const near = (actual, expected, tolerance) => Math.abs(actual - expected) <= tolerance;
check('real default engine has 66 weighted WPs and normalizes to 1',
  Object.keys(engine.effectiveWeights).length === 66 && near(sum, 1, 1e-12));
check('real group distribution matches approved model within canonical engine precision',
  near(groupWeights.project_wide, 0.4, 1e-12)
  && near(groupWeights.sales, 0.5052631579, 0.0015)
  && near(groupWeights.boh, 0.0947368421, 0.0015));
check('real key categories match approved model within canonical engine precision',
  near(engine.phaseWeights['sales.furniture_joinery'], 0.1654135338, 0.0005)
  && near(engine.phaseWeights['sales.shopfront_facade'], 0.1253132832, 0.0005)
  && near(engine.phaseWeights['project_wide.electrical'], 0.1, 1e-12)
  && near(engine.phaseWeights['project_wide.commissioning'], 0.0675675676, 0.00002)
  && near(engine.phaseWeights['project_wide.fire_life_safety'], 0.0648648649, 0.00002)
  && near(engine.phaseWeights['sales.signage_graphics'], 0.0120300752, 0.00005));
check('all persisted ineligible WPs produce zero/no weight',
  ineligible.every(wp => !Object.prototype.hasOwnProperty.call(engine.effectiveWeights, wp.id)));

console.log('\n3. V1/default protection');
const v1Row = JSON.parse(psql(`
  SELECT json_build_object(
    'id', id, 'family', family, 'familyId', family_id, 'version', version,
    'isActive', is_active, 'data', data
  )::text
  FROM public.templates
  WHERE id = '${RETAIL_FITOUT_V2_TEMPLATE_ID}';
`));
const v1Source = materializeRetailFitoutV2TemplateData();
const v1WpIds = v1Row.data.zones.flatMap(z => z.categories.flatMap(c => c.workPackages.map(wp => wp.id)));
const v1Fingerprint = createHash('sha256').update(v1WpIds.join('\n')).digest('hex');
check('v1 persisted row remains active version 1/schemaVersion 1',
  v1Row.isActive === true && v1Row.version === 1 && v1Row.data.schemaVersion === 1);
check('v1 persisted content equals canonical v1 source', equalJson(v1Row.data, v1Source));
check('v1 remains 3 groups / 23 categories / 91 WPs with frozen identity',
  v1Row.data.zones.length === 3
  && v1Row.data.zones.reduce((sumCategories, z) => sumCategories + z.categories.length, 0) === 23
  && v1WpIds.length === 91
  && v1Fingerprint === RETAIL_FITOUT_V2_WP_ID_SHA256);
const resolvedDefault = selectDefaultScopeTemplate([
  { ...v1Row, companyId: null },
  { ...row, companyId: null },
], { family: RETAIL_FITOUT_V2_FAMILY, companyId: null });
check('normal default resolver still returns v1', resolvedDefault?.id === RETAIL_FITOUT_V2_TEMPLATE_ID);
check('no existing project references the inactive v2 candidate', psql(`
  SELECT count(*) FROM public.projects WHERE template_id='${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}';
`) === '0');

console.log('\n4. Deterministic reapply failure');
let reapplyRejected = false;
try {
  execFileSync(psqlPath, [DB_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-f', migrationPath], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: psqlEnv,
  });
} catch (error) {
  reapplyRejected = `${error.stderr ?? ''}`.includes('MASTER_CATALOG_WEIGHT_PRECONDITION_MISMATCH');
}
check('044 reapply fails explicitly on already-finalized state', reapplyRejected);
const afterReapply = JSON.parse(psql(`
  SELECT data::text FROM public.templates WHERE id='${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}';
`));
check('rejected reapply leaves candidate unchanged', equalJson(afterReapply, canonicalData));

console.log(`\n-- Master Catalog weight DB certification: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
