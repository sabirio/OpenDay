import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  materializeRetailFitoutMasterCatalogTemplateData,
  RETAIL_FITOUT_MASTER_CATALOG_BASE_DURATION_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_DURATION_AREA_BASIS_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_DURATION_BANDS_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_DURATION_METADATA_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_DURATION_MODE_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_EXCLUDED_SET_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_FINAL_OPERATIONAL_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_MILESTONE_SET_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_OPERATIONAL_SEMANTIC_SHA256,
  RETAIL_FITOUT_MASTER_CATALOG_REFERENCE_AREAS_SHA256,
} from './versionedScopeTemplate.js';
import {
  DURATION_MODE,
  DURATION_RESOLUTION_MODE,
  resolveWorkPackageDuration,
  validateMasterCatalogDurationMetadata,
} from '../../../core/schedule/index.js';

let passed = 0;
let failed = 0;
function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  OK ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${label}: ${error.message}`);
  }
}
function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canon(value[key])]));
  }
  return value;
}
function sha256(value) {
  const normalized = typeof value === 'string' ? value : JSON.stringify(canon(value));
  return createHash('sha256').update(normalized).digest('hex');
}

const data = materializeRetailFitoutMasterCatalogTemplateData();
const workPackages = data.zones.flatMap(zone =>
  zone.categories.flatMap(category => category.workPackages));
const byId = new Map(workPackages.map(wp => [wp.id, wp]));
const fixed = workPackages.filter(wp => wp.duration?.mode === DURATION_MODE.FIXED);
const areaScaled = workPackages.filter(wp => wp.duration?.mode === DURATION_MODE.AREA_SCALED);
const milestones = workPackages.filter(wp => wp.duration?.mode === DURATION_MODE.MILESTONE);
const excluded = workPackages.filter(wp => wp.duration?.mode === DURATION_MODE.EXCLUDED);
const execution = [...fixed, ...areaScaled];
const expectedMilestones = [
  'project_wide.pre_handover.authority_approvals',
  'project_wide.pre_handover.landlord_approval',
  'common.pre_opening.final_walkthrough',
  'common.handover.snag_closure',
  'common.handover.final_inspection',
  'common.handover.acceptance_act',
  'common.handover.keys_possession',
];
const expectedExcluded = [
  'common.pre_opening.test_reports',
  'project_wide.handover.as_built',
  'project_wide.handover.om_manuals',
  'project_wide.handover.warranties',
  'project_wide.handover.asset_handover',
];

console.log('\n1. Complete approved duration contract');
check('real candidate passes schema-v2 Duration validation', () => {
  assert.deepEqual(validateMasterCatalogDurationMetadata(data), []);
});
check('mode counts are exactly 131/78/7/5 and execution count is 209', () => {
  assert.deepEqual(
    [fixed.length, areaScaled.length, milestones.length, excluded.length, execution.length],
    [131, 78, 7, 5, 209],
  );
});
check('every WP has exactly one supported explicit mode', () => {
  assert.equal(workPackages.length, 221);
  assert.ok(workPackages.every(wp => Object.values(DURATION_MODE).includes(wp.duration?.mode)));
});
check('FIXED shape is positive integer base with no area basis', () => {
  assert.ok(fixed.every(wp =>
    Number.isInteger(wp.duration.baseDurationDays)
    && wp.duration.baseDurationDays > 0
    && !Object.hasOwn(wp.duration, 'areaBasis')));
});
check('AREA_SCALED shape is positive integer base and canonical basis', () => {
  assert.ok(areaScaled.every(wp =>
    Number.isInteger(wp.duration.baseDurationDays)
    && wp.duration.baseDurationDays > 0
    && ['TOTAL_AREA', 'SALES_AREA', 'BOH_AREA'].includes(wp.duration.areaBasis)));
});
check('milestone and excluded sets/shapes are exact', () => {
  assert.deepEqual(milestones.map(wp => wp.id), expectedMilestones);
  assert.deepEqual(excluded.map(wp => wp.id), expectedExcluded);
  assert.ok([...milestones, ...excluded].every(wp =>
    !Object.hasOwn(wp.duration, 'baseDurationDays')
    && !Object.hasOwn(wp.duration, 'areaBasis')));
});
check('template-level model settings are exact', () => {
  assert.deepEqual(data.durationModel, {
    version: 1,
    unit: 'PROJECT_WORKING_DAY',
    calendarProfile: 'RETAIL_7_DAY',
    referenceAreas: { TOTAL_AREA: 950, SALES_AREA: 800, BOH_AREA: 150 },
    bands: [
      { maxRatio: 0.4, multiplier: 0.7 },
      { maxRatio: 0.75, multiplier: 0.85 },
      { maxRatio: 1.5, multiplier: 1 },
      { maxRatio: 2.5, multiplier: 1.15 },
      { maxRatio: null, multiplier: 1.3 },
    ],
  });
});

console.log('\n2. Approved anchors and real resolution');
const anchors = {
  'project_wide.electrical.incoming_supply_interface': ['FIXED', 3, null],
  'project_wide.electrical.distribution_panels': ['FIXED', 5, null],
  'project_wide.electrical.containment': ['AREA_SCALED', 8, 'TOTAL_AREA'],
  'project_wide.electrical.power_cabling': ['AREA_SCALED', 10, 'TOTAL_AREA'],
  'project_wide.electrical.generator_ats': ['FIXED', 7, null],
  'project_wide.hvac.fcu_installation': ['FIXED', 6, null],
  'project_wide.hvac.vrf_vrv': ['FIXED', 10, null],
  'project_wide.hvac.ductwork': ['AREA_SCALED', 12, 'TOTAL_AREA'],
  'project_wide.hvac.air_distribution': ['AREA_SCALED', 7, 'TOTAL_AREA'],
  'common.mep_backbone.sprinkler': ['AREA_SCALED', 10, 'TOTAL_AREA'],
  'project_wide.fire.fire_alarm': ['AREA_SCALED', 8, 'TOTAL_AREA'],
  'common.commissioning.fire_alarm_test': ['FIXED', 2, null],
  'sales.flooring.tile': ['AREA_SCALED', 12, 'SALES_AREA'],
  'sales.wall_finishes.painting': ['AREA_SCALED', 8, 'SALES_AREA'],
  'sales.furniture.wall_fixtures': ['AREA_SCALED', 10, 'SALES_AREA'],
  'sales.furniture.cash_desk': ['FIXED', 4, null],
  'boh.furniture.stockroom_shelving': ['AREA_SCALED', 7, 'BOH_AREA'],
  'boh.flooring.tile': ['AREA_SCALED', 6, 'BOH_AREA'],
  'project_wide.pre_handover.final_cleaning': ['AREA_SCALED', 5, 'TOTAL_AREA'],
  'project_wide.pre_handover.snagging': ['AREA_SCALED', 7, 'TOTAL_AREA'],
};
check('all approved calibration anchors match exactly', () => {
  for (const [id, [mode, days, basis]] of Object.entries(anchors)) {
    const duration = byId.get(id)?.duration;
    assert.equal(duration?.mode, mode, id);
    assert.equal(duration?.baseDurationDays, days, id);
    assert.equal(duration?.areaBasis ?? null, basis, id);
  }
});
function resolve(id, project) {
  return resolveWorkPackageDuration({ wp: byId.get(id), durationModel: data.durationModel, project });
}
const projects = {
  small: { storeSizeSqm: 220, salesAreaSqm: 185, backOfHouseAreaSqm: 35 },
  reference: { storeSizeSqm: 950, salesAreaSqm: 800, backOfHouseAreaSqm: 150 },
  flagship: { storeSizeSqm: 3000, salesAreaSqm: 2500, backOfHouseAreaSqm: 500 },
};
check('reference project resolves representative approved durations', () => {
  const expected = {
    'sales.wall_finishes.painting': 8,
    'sales.flooring.tile': 12,
    'project_wide.hvac.ductwork': 12,
    'project_wide.electrical.power_cabling': 10,
    'common.mep_backbone.sprinkler': 10,
    'sales.furniture.wall_fixtures': 10,
    'boh.furniture.stockroom_shelving': 7,
    'project_wide.electrical.distribution_panels': 5,
    'project_wide.electrical.generator_ats': 7,
    'sales.furniture.cash_desk': 4,
    'common.commissioning.fire_alarm_test': 2,
  };
  for (const [id, days] of Object.entries(expected)) {
    assert.equal(resolve(id, projects.reference).durationDays, days, id);
  }
});
check('small/reference/flagship scenarios resolve approved anchors', () => {
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
  for (const [id, days] of Object.entries(expected)) {
    assert.deepEqual(Object.values(projects).map(project => resolve(id, project).durationDays), days, id);
  }
});
check('milestones resolve to zero and excluded WPs do not participate', () => {
  const milestone = resolve('project_wide.pre_handover.authority_approvals', projects.reference);
  const keys = resolve('common.handover.keys_possession', projects.reference);
  const om = resolve('project_wide.handover.om_manuals', projects.reference);
  assert.equal(milestone.durationDays, 0);
  assert.equal(keys.durationDays, 0);
  assert.equal(om.durationDays, null);
  assert.equal(om.scheduleParticipation, false);
});
check('missing/invalid canonical areas use explicit base fallback; zero remains valid', () => {
  const cases = [
    ['project_wide.hvac.ductwork', {}, 12],
    ['sales.wall_finishes.painting', { salesAreaSqm: 'invalid' }, 8],
    ['boh.furniture.stockroom_shelving', { backOfHouseAreaSqm: null }, 7],
  ];
  for (const [id, project, base] of cases) {
    const result = resolve(id, project);
    assert.equal(result.durationDays, base, id);
    assert.equal(result.resolutionMode, DURATION_RESOLUTION_MODE.AREA_FALLBACK, id);
  }
  const zero = resolve('project_wide.hvac.ductwork', { storeSizeSqm: 0 });
  assert.equal(zero.durationDays, 8);
  assert.equal(zero.resolutionMode, DURATION_RESOLUTION_MODE.AREA_BAND);
});

console.log('\n3. Duration fingerprints and Weight firewall');
const modeNormalization = workPackages.map(wp => `${wp.id}|${wp.duration.mode}`).join('\n');
const baseNormalization = workPackages
  .filter(wp => [DURATION_MODE.FIXED, DURATION_MODE.AREA_SCALED].includes(wp.duration.mode))
  .map(wp => `${wp.id}|${wp.duration.baseDurationDays}`).join('\n');
const areaNormalization = areaScaled.map(wp => `${wp.id}|${wp.duration.areaBasis}`).join('\n');
const durationMetadata = {
  durationModel: data.durationModel,
  workPackages: workPackages.map(wp => ({ id: wp.id, duration: wp.duration })),
};
const weightOperationalData = structuredClone(data);
delete weightOperationalData.durationModel;
for (const zone of weightOperationalData.zones) {
  for (const category of zone.categories) {
    for (const wp of category.workPackages) delete wp.duration;
  }
}
check('all nine Duration/final fingerprints are exact', () => {
  assert.equal(sha256(modeNormalization), RETAIL_FITOUT_MASTER_CATALOG_DURATION_MODE_SHA256);
  assert.equal(sha256(baseNormalization), RETAIL_FITOUT_MASTER_CATALOG_BASE_DURATION_SHA256);
  assert.equal(sha256(areaNormalization), RETAIL_FITOUT_MASTER_CATALOG_DURATION_AREA_BASIS_SHA256);
  assert.equal(sha256(data.durationModel.referenceAreas), RETAIL_FITOUT_MASTER_CATALOG_REFERENCE_AREAS_SHA256);
  assert.equal(sha256(data.durationModel.bands), RETAIL_FITOUT_MASTER_CATALOG_DURATION_BANDS_SHA256);
  assert.equal(sha256(milestones.map(wp => wp.id).join('\n')), RETAIL_FITOUT_MASTER_CATALOG_MILESTONE_SET_SHA256);
  assert.equal(sha256(excluded.map(wp => wp.id).join('\n')), RETAIL_FITOUT_MASTER_CATALOG_EXCLUDED_SET_SHA256);
  assert.equal(sha256(durationMetadata), RETAIL_FITOUT_MASTER_CATALOG_DURATION_METADATA_SHA256);
  assert.equal(sha256(data), RETAIL_FITOUT_MASTER_CATALOG_FINAL_OPERATIONAL_SHA256);
});
check('frozen Weight operational fingerprint is unchanged when Duration is removed', () => {
  assert.equal(sha256(weightOperationalData), RETAIL_FITOUT_MASTER_CATALOG_OPERATIONAL_SEMANTIC_SHA256);
});
check('real metadata contains no procurement timing fields', () => {
  assert.doesNotMatch(JSON.stringify(durationMetadata), /procurementLeadDays|manufacturingDays|shippingDays|deliveryDays/);
});
check('default scope inventory is exactly 27/42/5/4 and 69 execution', () => {
  const defaultSet = new Set(data.defaultScope.workPackageIds);
  const scoped = workPackages.filter(wp => defaultSet.has(wp.id));
  const count = mode => scoped.filter(wp => wp.duration.mode === mode).length;
  assert.deepEqual(
    [count('FIXED'), count('AREA_SCALED'), count('MILESTONE'), count('EXCLUDED')],
    [27, 42, 5, 4],
  );
  assert.equal(scoped.filter(wp => ['FIXED', 'AREA_SCALED'].includes(wp.duration.mode)).length, 69);
});

console.log('\n4. Generated migration provenance and equivalence');
const migration = readFileSync(new URL('../../../migrations/045_master_catalog_duration_calibration.sql', import.meta.url), 'utf8');
const migrationSql = migration.replace(/^--.*$/gm, '');
const prePayload = migration.match(/\$pre_duration\$\r?\n([\s\S]+?)\r?\n\$pre_duration\$::jsonb/)?.[1];
const finalPayload = migration.match(/\$duration_catalog\$\r?\n([\s\S]+?)\r?\n\$duration_catalog\$::jsonb/)?.[1];
check('045 exact pre-duration payload equals frozen weighted source', () => {
  assert.deepEqual(JSON.parse(prePayload), weightOperationalData);
});
check('045 finalized payload equals canonical source', () => {
  assert.deepEqual(JSON.parse(finalPayload), data);
});
check('045 is one guarded update with explicit one-shot refusal semantics', () => {
  assert.equal((migration.match(/\bUPDATE public\.templates\b/g) ?? []).length, 1);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /project_reference_count <> 0/);
  assert.match(migration, /current_data IS DISTINCT FROM \$pre_duration\$/);
});
check('045 changes no projects, RLS, grants, policies, schema, activation, or defaults', () => {
  assert.doesNotMatch(migrationSql, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?public\.projects\b/i);
  assert.doesNotMatch(migrationSql, /\b(?:CREATE|DROP|ALTER)\s+POLICY\b/i);
  assert.doesNotMatch(migrationSql, /\bGRANT\b|\bREVOKE\b|\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(migrationSql, /\bSET\s+is_active\b/i);
});

console.log(`\n-- RESULT: ${passed} passed, ${failed} failed --\n`);
process.exit(failed === 0 ? 0 : 1);
