import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';
import {
  materializeRetailFitoutMasterCatalogTemplateData,
  materializeRetailFitoutV2TemplateData,
  selectDefaultScopeTemplate,
  RETAIL_FITOUT_MASTER_CATALOG_FINAL_OPERATIONAL_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_OPERATIONAL_SEMANTIC_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID,
  RETAIL_FITOUT_V2_FAMILY,
  RETAIL_FITOUT_V2_TEMPLATE_ID,
} from '../../src/domains/construction/templates/versionedScopeTemplate.js';
import {
  DURATION_RESOLUTION_MODE,
  resolveWorkPackageDuration,
  validateMasterCatalogDurationMetadata,
} from '../../src/core/schedule/index.js';

const DB_URL = process.env.CERT_DB_URL;
assertLocalTarget({
  apiUrl: process.env.CERT_SUPABASE_URL,
  dbUrl: DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(__dirname, '..', '..', 'src', 'migrations', '045_master_catalog_duration_calibration.sql');
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
function hash(value) {
  return createHash('sha256').update(JSON.stringify(canon(value))).digest('hex');
}
function equalJson(a, b) {
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}
let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) {
    pass += 1;
    console.log(`  OK ${label}`);
  } else {
    fail += 1;
    console.error(`  FAIL ${label}`);
  }
}

const row = JSON.parse(psql(`
  SELECT json_build_object(
    'id', id, 'family', family, 'companyId', company_id, 'version', version,
    'isActive', is_active, 'data', data,
    'projectReferences', (SELECT count(*) FROM public.projects WHERE template_id = templates.id)
  )::text
  FROM public.templates
  WHERE id = '${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}';
`));
const canonicalData = materializeRetailFitoutMasterCatalogTemplateData();
const migration = readFileSync(migrationPath, 'utf8');
const migrationPayload = JSON.parse(
  migration.match(/\$duration_catalog\$\r?\n([\s\S]+?)\r?\n\$duration_catalog\$::jsonb/)?.[1] ?? 'null',
);
const workPackages = row.data.zones.flatMap(zone =>
  zone.categories.flatMap(category => category.workPackages));
const byId = new Map(workPackages.map(wp => [wp.id, wp]));
const fixed = workPackages.filter(wp => wp.duration?.mode === 'FIXED');
const area = workPackages.filter(wp => wp.duration?.mode === 'AREA_SCALED');
const milestones = workPackages.filter(wp => wp.duration?.mode === 'MILESTONE');
const excluded = workPackages.filter(wp => wp.duration?.mode === 'EXCLUDED');

console.log('\n1. Source / migration / local DB equivalence');
check('candidate identity exact, inactive, global, and unreferenced',
  row.id === RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID
  && row.family === RETAIL_FITOUT_V2_FAMILY
  && row.companyId === null
  && row.version === 2
  && row.data.schemaVersion === 2
  && row.isActive === false
  && Number(row.projectReferences) === 0);
check('canonical source equals generated migration payload', equalJson(canonicalData, migrationPayload));
check('generated migration payload equals actual local DB row', equalJson(migrationPayload, row.data));
check('actual local DB row passes Duration contract validation',
  validateMasterCatalogDurationMetadata(row.data).length === 0);
check('final persisted operational fingerprint exact',
  hash(row.data) === RETAIL_FITOUT_MASTER_CATALOG_FINAL_OPERATIONAL_SHA256);
const weightData = structuredClone(row.data);
delete weightData.durationModel;
for (const zone of weightData.zones) {
  for (const category of zone.categories) {
    for (const wp of category.workPackages) delete wp.duration;
  }
}
check('frozen persisted Weight operational fingerprint unchanged',
  hash(weightData) === RETAIL_FITOUT_MASTER_CATALOG_OPERATIONAL_SEMANTIC_SHA256);

console.log('\n2. Persisted counts, scope, and real resolver');
check('persisted modes and execution count exact',
  workPackages.length === 221
  && fixed.length === 131
  && area.length === 78
  && milestones.length === 7
  && excluded.length === 5
  && fixed.length + area.length === 209);
const defaultSet = new Set(row.data.defaultScope.workPackageIds);
const scoped = workPackages.filter(wp => defaultSet.has(wp.id));
check('default scope inventory exact 27/42/5/4 and 69 execution',
  scoped.filter(wp => wp.duration.mode === 'FIXED').length === 27
  && scoped.filter(wp => wp.duration.mode === 'AREA_SCALED').length === 42
  && scoped.filter(wp => wp.duration.mode === 'MILESTONE').length === 5
  && scoped.filter(wp => wp.duration.mode === 'EXCLUDED').length === 4
  && scoped.filter(wp => ['FIXED', 'AREA_SCALED'].includes(wp.duration.mode)).length === 69);
function resolve(id, project) {
  return resolveWorkPackageDuration({
    wp: byId.get(id),
    durationModel: row.data.durationModel,
    project,
  });
}
const projects = [
  { storeSizeSqm: 220, salesAreaSqm: 185, backOfHouseAreaSqm: 35 },
  { storeSizeSqm: 950, salesAreaSqm: 800, backOfHouseAreaSqm: 150 },
  { storeSizeSqm: 3000, salesAreaSqm: 2500, backOfHouseAreaSqm: 500 },
];
const expected = {
  'sales.wall_finishes.painting': [6, 8, 10],
  'sales.flooring.tile': [8, 12, 16],
  'project_wide.hvac.ductwork': [8, 12, 16],
  'project_wide.electrical.power_cabling': [7, 10, 13],
  'common.mep_backbone.sprinkler': [7, 10, 13],
  'sales.furniture.wall_fixtures': [7, 10, 13],
  'boh.furniture.stockroom_shelving': [5, 7, 9],
  'project_wide.electrical.distribution_panels': [5, 5, 5],
  'project_wide.electrical.generator_ats': [7, 7, 7],
};
check('small/reference/flagship real resolutions exact',
  Object.entries(expected).every(([id, days]) =>
    projects.map(project => resolve(id, project).durationDays).join(',') === days.join(',')));
check('milestone/excluded real semantics exact',
  resolve('project_wide.pre_handover.authority_approvals', projects[1]).durationDays === 0
  && resolve('common.handover.keys_possession', projects[1]).durationDays === 0
  && resolve('project_wide.handover.om_manuals', projects[1]).scheduleParticipation === false);
check('missing canonical areas produce explicit AREA_FALLBACK',
  resolve('project_wide.hvac.ductwork', {}).resolutionMode === DURATION_RESOLUTION_MODE.AREA_FALLBACK
  && resolve('sales.wall_finishes.painting', { salesAreaSqm: 'invalid' }).resolutionMode === DURATION_RESOLUTION_MODE.AREA_FALLBACK
  && resolve('boh.furniture.stockroom_shelving', {}).resolutionMode === DURATION_RESOLUTION_MODE.AREA_FALLBACK);

console.log('\n3. V1/default/Gantt protection');
const v1Row = JSON.parse(psql(`
  SELECT json_build_object(
    'id',id,'family',family,'familyId',family_id,'companyId',company_id,
    'version',version,'isActive',is_active,'data',data
  )::text
  FROM public.templates WHERE id='${RETAIL_FITOUT_V2_TEMPLATE_ID}';
`));
check('v1 active version/schema 1 remains byte-equivalent to canonical source',
  v1Row.version === 1
  && v1Row.isActive === true
  && v1Row.data.schemaVersion === 1
  && equalJson(v1Row.data, materializeRetailFitoutV2TemplateData()));
check('normal default resolver still returns v1',
  selectDefaultScopeTemplate([
    { ...v1Row, companyId: null },
    { ...row, companyId: null },
  ], { family: RETAIL_FITOUT_V2_FAMILY, companyId: null })?.id === RETAIL_FITOUT_V2_TEMPLATE_ID);
check('v2 remains inactive with empty dependency placeholder',
  row.isActive === false && Array.isArray(row.data.dependencies) && row.data.dependencies.length === 0);

console.log('\n4. Deterministic one-shot refusal');
const before = psql(`SELECT data::text FROM public.templates WHERE id='${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}';`);
let rejected = false;
try {
  execFileSync(psqlPath, [DB_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-f', migrationPath], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: psqlEnv,
  });
} catch (error) {
  rejected = /MASTER_CATALOG_DURATION_PRECONDITION_MISMATCH/.test(
    `${error.stdout?.toString() ?? ''}${error.stderr?.toString() ?? ''}`,
  );
}
const after = psql(`SELECT data::text FROM public.templates WHERE id='${RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID}';`);
check('045 reapply explicitly refuses already-finalized state', rejected);
check('rejected reapply performs zero mutation', before === after);

console.log(`\n-- Master Catalog duration DB certification: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
