import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  materializeRetailFitoutMasterCatalogTemplateData,
  validateMasterCatalogTemplateData,
  validateMasterCatalogWeightMetadata,
  isOperationalMasterCatalogWeightModel,
  RETAIL_FITOUT_MASTER_CATALOG_ELIGIBILITY_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_BASE_EFFORT_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_CATEGORY_FACTOR_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_GROUP_WEIGHT_SETTINGS_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_WEIGHT_METADATA_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_OPERATIONAL_SEMANTIC_SHA256,
} from './versionedScopeTemplate.js';
import { buildMasterCatalogProgressTemplate } from '../../../core/projects/weights/buildMasterCatalogProgressTemplate.js';
import { resolveProjectScopeSelection } from '../../../core/projects/scope/getScopeWPIds.js';
import { computeMasterCatalogEffectiveWeights } from '../../../engines/masterCatalogWeightEngine.js';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass += 1; console.log(`  OK ${label}`); }
  else { fail += 1; console.error(`  FAIL ${label}`); }
}

const data = materializeRetailFitoutMasterCatalogTemplateData();
const categories = data.zones.flatMap(zone =>
  zone.categories.map(category => ({ ...category, zoneId: zone.id })));
const workPackages = categories.flatMap(category =>
  category.workPackages.map(wp => ({ ...wp, zoneId: category.zoneId, categoryId: category.id })));
const byId = new Map(workPackages.map(wp => [wp.id, wp]));
const defaultIds = data.defaultScope.workPackageIds;
const defaultSet = new Set(defaultIds);
const eligible = workPackages.filter(wp => wp.constructionProgressEligible);
const ineligible = workPackages.filter(wp => !wp.constructionProgressEligible);
const defaultEligible = workPackages.filter(wp => defaultSet.has(wp.id) && wp.constructionProgressEligible);
const defaultIneligible = workPackages.filter(wp => defaultSet.has(wp.id) && !wp.constructionProgressEligible);

const EXPECTED_INELIGIBLE = [
  'project_wide.fire.extinguishers',
  'common.pre_opening.test_reports',
  'project_wide.pre_handover.authority_approvals',
  'project_wide.pre_handover.landlord_approval',
  'project_wide.pre_handover.final_cleaning',
  'common.pre_opening.final_walkthrough',
  'project_wide.pre_handover.training',
  'project_wide.handover.as_built',
  'common.handover.snag_closure',
  'common.handover.final_inspection',
  'common.handover.acceptance_act',
  'common.handover.keys_possession',
  'project_wide.handover.om_manuals',
  'project_wide.handover.warranties',
  'project_wide.handover.asset_handover',
  'sales.signage.regulatory_safety',
  'boh.equipment.it_equipment',
  'boh.equipment.printers',
  'boh.equipment.office_devices',
];

console.log('\n1. Exact approved content');
check('structural validation passes', validateMasterCatalogTemplateData(data).length === 0);
check('operational weight validation passes', validateMasterCatalogWeightMetadata(data).length === 0);
check('operational predicate is true', isOperationalMasterCatalogWeightModel(data));
check('221 total / 202 eligible / 19 ineligible',
  workPackages.length === 221 && eligible.length === 202 && ineligible.length === 19);
check('78 default / 66 eligible / 12 ineligible',
  defaultIds.length === 78 && defaultEligible.length === 66 && defaultIneligible.length === 12);
check('exact approved 19-item ineligible set',
  JSON.stringify(ineligible.map(wp => wp.id).sort()) === JSON.stringify([...EXPECTED_INELIGIBLE].sort()));
check('202 eligible WPs have integer baseEffort in approved practical range 2-9',
  eligible.every(wp => Number.isInteger(wp.baseEffort) && wp.baseEffort >= 2 && wp.baseEffort <= 9));
check('19 ineligible WPs have no baseEffort',
  ineligible.every(wp => !Object.prototype.hasOwnProperty.call(wp, 'baseEffort')));
check('25 category factors use only 0.75/1/1.25',
  categories.filter(c => c.categoryFactor !== undefined).length === 25
  && categories.filter(c => c.categoryFactor !== undefined).every(c => [0.75, 1, 1.25].includes(c.categoryFactor)));
check('Handover & Documentation is the sole category without a factor and has zero eligible WPs',
  categories.filter(c => c.categoryFactor === undefined).length === 1
  && categories.find(c => c.id === 'project_wide.handover_documentation')?.workPackages.every(wp => !wp.constructionProgressEligible));

console.log('\n2. Group/category/base-effort regression anchors');
check('Project-Wide group settings exact',
  JSON.stringify(data.zones.find(z => z.id === 'project_wide'))
    && data.zones.find(z => z.id === 'project_wide')?.areaBasis === 'NONE'
    && data.zones.find(z => z.id === 'project_wide')?.anchorPct === 40
    && !Object.prototype.hasOwnProperty.call(data.zones.find(z => z.id === 'project_wide'), 'defaultWeight'));
check('Sales group settings exact',
  data.zones.find(z => z.id === 'sales')?.areaBasis === 'SALES_AREA'
  && data.zones.find(z => z.id === 'sales')?.defaultWeight === 80
  && !Object.prototype.hasOwnProperty.call(data.zones.find(z => z.id === 'sales'), 'anchorPct'));
check('BOH group settings exact',
  data.zones.find(z => z.id === 'boh')?.areaBasis === 'BOH_AREA'
  && data.zones.find(z => z.id === 'boh')?.defaultWeight === 20
  && !Object.prototype.hasOwnProperty.call(data.zones.find(z => z.id === 'boh'), 'anchorPct'));
const factorById = Object.fromEntries(categories.map(c => [c.id, c.categoryFactor]));
check('major category factors exact',
  factorById['project_wide.electrical'] === 0.75
  && factorById['project_wide.hvac'] === 0.75
  && factorById['project_wide.low_current_ict_security'] === 0.75
  && factorById['project_wide.commissioning'] === 0.75
  && factorById['project_wide.refrigeration_food_service'] === 1.25
  && factorById['sales.shopfront_facade'] === 1.25
  && factorById['sales.furniture_joinery'] === 1.25
  && factorById['boh.furniture_storage'] === 1.25);
const effort = id => byId.get(id)?.baseEffort;
check('Electrical effort anchors exact',
  effort('project_wide.electrical.earthing_bonding') === 2
  && effort('project_wide.electrical.metering') === 2
  && effort('project_wide.electrical.distribution_panels') === 6
  && effort('project_wide.electrical.generator_ats') === 9
  && effort('project_wide.electrical.busbar') === 7);
check('HVAC/Refrigeration/Furniture effort anchors exact',
  effort('project_wide.hvac.landlord_interface') === 2
  && effort('project_wide.hvac.ductwork') === 7
  && effort('project_wide.hvac.vrf_vrv') === 8
  && effort('project_wide.hvac.special_exhaust') === 8
  && effort('project_wide.refrigeration.system') === 9
  && effort('project_wide.refrigeration.cold_rooms') === 7
  && effort('project_wide.refrigeration.freezer_rooms') === 7
  && effort('sales.furniture.wall_fixtures') === 8
  && effort('sales.furniture.display_shelving') === 8
  && effort('sales.furniture.freestanding') === 7
  && effort('sales.furniture.cash_desk') === 4);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canon(value[key])]));
  }
  return value;
}
const eligibilityNormalization = workPackages
  .map(wp => `${wp.id}\t${wp.constructionProgressEligible ? '1' : '0'}`).join('\n');
const effortNormalization = eligible.map(wp => `${wp.id}\t${wp.baseEffort}`).join('\n');
const categoryNormalization = categories
  .map(c => `${c.zoneId}\t${c.id}\t${c.categoryFactor ?? 'ABSENT'}`).join('\n');
const groupNormalization = data.zones
  .map(z => `${z.id}\t${z.areaBasis}\t${z.anchorPct ?? 'ABSENT'}\t${z.defaultWeight ?? 'ABSENT'}`).join('\n');
const weightMetadata = {
  groups: data.zones.map(zone => ({
    id: zone.id,
    areaBasis: zone.areaBasis,
    anchorPct: zone.anchorPct ?? null,
    defaultWeight: zone.defaultWeight ?? null,
    categories: zone.categories.map(category => ({
      id: category.id,
      categoryFactor: category.categoryFactor ?? null,
      workPackages: category.workPackages.map(wp => ({
        id: wp.id,
        constructionProgressEligible: wp.constructionProgressEligible,
        baseEffort: wp.baseEffort ?? null,
      })),
    })),
  })),
};
const weightOperationalData = structuredClone(data);
delete weightOperationalData.durationModel;
for (const zone of weightOperationalData.zones) {
  for (const category of zone.categories) {
    for (const wp of category.workPackages) delete wp.duration;
  }
}

console.log('\n3. Deterministic fingerprints');
check('eligibility fingerprint', sha256(eligibilityNormalization) === RETAIL_FITOUT_MASTER_CATALOG_ELIGIBILITY_SHA256);
check('baseEffort fingerprint', sha256(effortNormalization) === RETAIL_FITOUT_MASTER_CATALOG_BASE_EFFORT_SHA256);
check('categoryFactor fingerprint', sha256(categoryNormalization) === RETAIL_FITOUT_MASTER_CATALOG_CATEGORY_FACTOR_SHA256);
check('group settings fingerprint', sha256(groupNormalization) === RETAIL_FITOUT_MASTER_CATALOG_GROUP_WEIGHT_SETTINGS_SHA256);
check('complete weight-metadata fingerprint',
  sha256(JSON.stringify(canon(weightMetadata))) === RETAIL_FITOUT_MASTER_CATALOG_WEIGHT_METADATA_SHA256);
check('frozen weight-operational semantic fingerprint excludes Duration metadata',
  sha256(JSON.stringify(canon(weightOperationalData))) === RETAIL_FITOUT_MASTER_CATALOG_OPERATIONAL_SEMANTIC_SHA256);

console.log('\n4. Migration provenance and equivalence');
const migration043 = readFileSync(new URL('../../../migrations/043_retail_fitout_master_catalog.sql', import.meta.url), 'utf8');
const migration044 = readFileSync(new URL('../../../migrations/044_master_catalog_weight_calibration.sql', import.meta.url), 'utf8');
const migration044Sql = migration044.replace(/^--.*$/gm, '');
const preWeightPayload = migration044.match(/\$pre_weight\$\r?\n([\s\S]+?)\r?\n\$pre_weight\$::jsonb/)?.[1];
const weightedPayload = migration044.match(/\$weighted_catalog\$\r?\n([\s\S]+?)\r?\n\$weighted_catalog\$::jsonb/)?.[1];
const stripped = structuredClone(weightOperationalData);
for (const zone of stripped.zones) {
  delete zone.areaBasis;
  delete zone.anchorPct;
  delete zone.defaultWeight;
  for (const category of zone.categories) {
    delete category.categoryFactor;
    for (const wp of category.workPackages) {
      delete wp.constructionProgressEligible;
      delete wp.baseEffort;
    }
  }
}
check('migration 043 immutable historical hash unchanged',
  sha256(migration043.replace(/\r\n/g, '\n')) === 'db527766054a59831e4826429a96249050640ee89c5f023832db0f752e87d59e');
check('044 exact pre-weight payload equals mechanically stripped canonical source',
  preWeightPayload != null && JSON.stringify(JSON.parse(preWeightPayload)) === JSON.stringify(stripped));
check('044 exact finalized payload equals canonical pre-duration source',
  weightedPayload != null && JSON.stringify(JSON.parse(weightedPayload)) === JSON.stringify(weightOperationalData));
check('044 is one guarded UPDATE of public.templates.data',
  (migration044.match(/\bUPDATE public\.templates\b/g) ?? []).length === 1
  && /FOR UPDATE/.test(migration044)
  && /project_reference_count <> 0/.test(migration044)
  && /current_data IS DISTINCT FROM \$pre_weight\$/.test(migration044));
check('044 does not change projects, RLS, grants, policies, schema, activation, or defaults',
  !/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?public\.projects\b/i.test(migration044Sql)
  && !/\b(?:CREATE|DROP|ALTER)\s+POLICY\b/i.test(migration044Sql)
  && !/\bGRANT\b|\bREVOKE\b|\bALTER\s+TABLE\b/i.test(migration044Sql)
  && !/\bSET\s+is_active\b/i.test(migration044Sql));

function resultFor(ids) {
  const template = buildMasterCatalogProgressTemplate({ sales: 800, boh: 150 }, { data });
  const result = computeMasterCatalogEffectiveWeights(template.workPackages, ids, template.groupShares);
  const groupWeights = {};
  for (const [id, weight] of Object.entries(result.effectiveWeights)) {
    const wp = byId.get(id);
    groupWeights[wp.zoneId] = (groupWeights[wp.zoneId] ?? 0) + weight;
  }
  return { ...result, groupWeights };
}
const near = (actual, expected, tolerance = 0.00002) => Math.abs(actual - expected) <= tolerance;
const defaultResult = resultFor(defaultIds);

console.log('\n5. Real candidate default-scope engine certification');
check('default engine input remains 78/66/12',
  defaultIds.length === 78
  && Object.keys(defaultResult.effectiveWeights).length === 66
  && defaultIneligible.length === 12);
check('default weights normalize to 1', near(Object.values(defaultResult.effectiveWeights).reduce((a, b) => a + b, 0), 1, 1e-12));
check('group distribution = 40 / 50.526 / 9.474',
  near(defaultResult.groupWeights.project_wide, 0.4)
  && near(defaultResult.groupWeights.sales, 0.5052631579, 0.0015)
  && near(defaultResult.groupWeights.boh, 0.0947368421, 0.0015));
check('key approved category results reproduced',
  near(defaultResult.phaseWeights['sales.furniture_joinery'], 0.1654135338, 0.0005)
  && near(defaultResult.phaseWeights['sales.shopfront_facade'], 0.1253132832, 0.0005)
  && near(defaultResult.phaseWeights['project_wide.electrical'], 0.1)
  && near(defaultResult.phaseWeights['project_wide.commissioning'], 0.0675675676)
  && near(defaultResult.phaseWeights['project_wide.fire_life_safety'], 0.0648648649)
  && near(defaultResult.phaseWeights['sales.signage_graphics'], 0.0120300752, 0.00005));

console.log('\n6. Ineligible behavior');
const resolvedAll = resolveProjectScopeSelection({
  scope: { workPackages: workPackages.map(wp => wp.id) },
  workPackages,
  schemaVersion: data.schemaVersion,
});
check('all 19 ineligible WPs remain resolvable in Project Scope',
  EXPECTED_INELIGIBLE.every(id => resolvedAll.includes(id)));
const allResult = resultFor(resolvedAll);
check('all 19 ineligible WPs produce exactly zero/no Construction Progress weight',
  EXPECTED_INELIGIBLE.every(id => !Object.prototype.hasOwnProperty.call(allResult.effectiveWeights, id)));
check('specific corrected WPs remain present, lack baseEffort, and have zero weight',
  ['sales.signage.regulatory_safety', 'project_wide.fire.extinguishers', 'common.handover.keys_possession', 'boh.equipment.it_equipment']
    .every(id => byId.has(id) && !Object.prototype.hasOwnProperty.call(byId.get(id), 'baseEffort')
      && !Object.prototype.hasOwnProperty.call(allResult.effectiveWeights, id)));

console.log('\n7. Real-candidate stress tests');
const ADD_OPTIONAL = [
  'project_wide.electrical.generator_ats',
  'project_wide.electrical.ups',
  'sales.facade.automatic_doors',
  'sales.retail_technology.digital_screens',
  'sales.retail_technology.self_checkout',
];
const ADD_REFRIGERATION = [
  'project_wide.refrigeration.cold_rooms',
  'project_wide.refrigeration.freezer_rooms',
  'project_wide.refrigeration.system',
  'project_wide.refrigeration.display_units',
];
const REMOVE_HALF_ELECTRICAL = [
  'project_wide.electrical.small_power',
  'project_wide.electrical.lighting_wiring',
  'project_wide.electrical.general_lighting',
  'project_wide.electrical.emergency_lighting',
];
const REMOVE_SHOPFRONT = [
  'sales.facade.shopfront_framing',
  'sales.facade.shopfront_glazing',
  'sales.facade.entrance_doors',
  'sales.facade.external_brand_signage',
  'sales.facade.window_display_infrastructure',
];
const REMOVE_BOH_FINISHES = [
  'boh.ceilings.framing',
  'boh.ceilings.gypsum',
  'boh.finishing.ceiling_final',
  'boh.wall_finishes.surface_preparation',
  'boh.wall_finishes.painting',
  'boh.flooring.tile',
  'boh.flooring.skirting_trims',
];
const cases = {
  default: defaultIds,
  optional: [...new Set([...defaultIds, ...ADD_OPTIONAL])],
  refrigeration: [...new Set([...defaultIds, ...ADD_REFRIGERATION])],
  halfElectrical: defaultIds.filter(id => !REMOVE_HALF_ELECTRICAL.includes(id)),
  noShopfront: defaultIds.filter(id => !REMOVE_SHOPFRONT.includes(id)),
  noBohFinishes: defaultIds.filter(id => !REMOVE_BOH_FINISHES.includes(id)),
};
const results = Object.fromEntries(Object.entries(cases).map(([name, ids]) => [name, resultFor(ids)]));
check('all six stress cases normalize to 1',
  Object.values(results).every(result => near(Object.values(result.effectiveWeights).reduce((a, b) => a + b, 0), 1, 1e-12)));
check('optional additions reproduce approved count and bounded distribution',
  cases.optional.length === 83
  && Object.keys(results.optional.effectiveWeights).length === 71
  && near(results.optional.phaseWeights['sales.furniture_joinery'], 0.14861, 0.0005)
  && near(results.optional.phaseWeights['sales.shopfront_facade'], 0.13960, 0.0005));
check('refrigeration additions reproduce approved contribution',
  cases.refrigeration.length === 82
  && Object.keys(results.refrigeration.effectiveWeights).length === 70
  && near(results.refrigeration.phaseWeights['project_wide.refrigeration_food_service'], 0.10101, 0.00002));
check('half Electrical removal reproduces approved decline',
  near(results.halfElectrical.phaseWeights['project_wide.electrical'], 0.05846, 0.00002));
check('Shopfront removal leaves no ghost category weight',
  !Object.prototype.hasOwnProperty.call(results.noShopfront.phaseWeights, 'sales.shopfront_facade'));
check('BOH finish removal leaves no ghost finish categories and preserves normalized BOH group',
  !Object.prototype.hasOwnProperty.call(results.noBohFinishes.phaseWeights, 'boh.ceilings')
  && !Object.prototype.hasOwnProperty.call(results.noBohFinishes.phaseWeights, 'boh.wall_finishes')
  && !Object.prototype.hasOwnProperty.call(results.noBohFinishes.phaseWeights, 'boh.flooring')
  && near(results.noBohFinishes.groupWeights.boh, 0.0947368421, 0.0015));

console.log('\n8. Activation blockers');
const templateModelDoc = readFileSync(new URL('../../../config/TEMPLATE_MODEL.md', import.meta.url), 'utf8');
check('Historical Progress Snapshot Provenance blocker retained',
  /Historical Progress Snapshot Provenance/.test(templateModelDoc)
  || /progress_history currently stores/.test(templateModelDoc));
check('Default Scope Consistency Review blocker retained',
  /Default Scope Consistency Review/.test(templateModelDoc)
  && /CCTV\s+Installation[\s\S]*CCTV\s+Commissioning/.test(templateModelDoc)
  && /Access-Control\s+Installation[\s\S]*Access-Control\s+Test/.test(templateModelDoc));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
