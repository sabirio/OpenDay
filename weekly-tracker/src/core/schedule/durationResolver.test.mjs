import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DURATION_MODE,
  DURATION_RESOLUTION_MODE,
  PROJECT_SCHEDULE_ROUTE,
  DurationContractError,
  isOperationalMasterCatalogDurationModel,
  resolveProjectScheduleModel,
  resolveSelectedScopeDurations,
  resolveWorkPackageDuration,
  validateDurationModel,
  validateMasterCatalogDurationMetadata,
  validateWorkPackageDurationMetadata,
} from './index.js';
import {
  materializeRetailFitoutMasterCatalogTemplateData,
  materializeRetailFitoutV2TemplateData,
} from '../../domains/construction/templates/versionedScopeTemplate.js';
import { buildProjectWPsV2 } from '../../engines/ganttEngine.js';

let passed = 0;
let failed = 0;
function check(name, test) {
  try {
    test();
    passed += 1;
    console.log(`  OK ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error.stack ?? error.message}`);
  }
}

// Arbitrary certification fixtures only. These values are intentionally not
// exported and are not production Master Catalog calibration.
const FIXTURE_DURATION_MODEL = Object.freeze({
  version: 77,
  unit: 'PROJECT_WORKING_DAY',
  calendarProfile: 'RETAIL_7_DAY',
  referenceAreas: {
    TOTAL_AREA: 1000,
    SALES_AREA: 600,
    BOH_AREA: 200,
  },
  bands: [
    { maxRatio: 0.5, multiplier: 0.6 },
    { maxRatio: 1, multiplier: 0.8 },
    { maxRatio: 2, multiplier: 1 },
    { maxRatio: null, multiplier: 1.2 },
  ],
});

const FIXTURE_WPS = Object.freeze([
  { id: 'fixture.electrical.distribution_panel', label: 'Distribution Panel', duration: { mode: DURATION_MODE.FIXED, baseDurationDays: 4 } },
  { id: 'fixture.electrical.generator', label: 'Generator Installation', duration: { mode: DURATION_MODE.FIXED, baseDurationDays: 5 } },
  { id: 'fixture.sales.painting', label: 'Sales Painting', duration: { mode: DURATION_MODE.AREA_SCALED, baseDurationDays: 10, areaBasis: 'SALES_AREA' } },
  { id: 'fixture.boh.flooring', label: 'BOH Flooring', duration: { mode: DURATION_MODE.AREA_SCALED, baseDurationDays: 8, areaBasis: 'BOH_AREA' } },
  { id: 'fixture.project.ductwork', label: 'Project-Wide Ductwork', duration: { mode: DURATION_MODE.AREA_SCALED, baseDurationDays: 12, areaBasis: 'TOTAL_AREA' } },
  { id: 'fixture.handover.final_inspection', label: 'Final Inspection', duration: { mode: DURATION_MODE.MILESTONE } },
  { id: 'fixture.handover.om_documentation', label: 'O&M Documentation', duration: { mode: DURATION_MODE.EXCLUDED } },
]);

const FIXTURE_PROJECT = Object.freeze({
  storeSizeSqm: 1000,
  salesAreaSqm: 600,
  backOfHouseAreaSqm: 200,
  // Deliberately disagreeing legacy scope input: schema-v2 duration must
  // consume canonical project columns, never scope.zoneAreas.
  scope: { zoneAreas: { sales: 1, boh: 1 } },
});

const FIXTURE_TEMPLATE = Object.freeze({
  schemaVersion: 2,
  durationModel: FIXTURE_DURATION_MODEL,
  zones: [{
    id: 'fixture',
    categories: [{
      id: 'fixture.category',
      workPackages: FIXTURE_WPS,
    }],
  }],
});

function wp(id) {
  return FIXTURE_WPS.find(candidate => candidate.id === id);
}

function resolve(id, project = FIXTURE_PROJECT, candidate = wp(id)) {
  return resolveWorkPackageDuration({
    wp: candidate,
    durationModel: FIXTURE_DURATION_MODEL,
    project,
  });
}

console.log('\nSchema-v2 duration contract validation');
check('fixture duration model satisfies the governed template-level contract', () => {
  assert.deepEqual(validateDurationModel(FIXTURE_DURATION_MODEL), []);
});
check('fixture template is operational for schema-v2 duration resolution', () => {
  assert.deepEqual(validateMasterCatalogDurationMetadata(FIXTURE_TEMPLATE), []);
  assert.equal(isOperationalMasterCatalogDurationModel(FIXTURE_TEMPLATE), true);
});
check('missing duration mode fails explicitly', () => {
  const issues = validateWorkPackageDurationMetadata({ id: 'missing', duration: {} });
  assert.ok(issues.some(candidate => candidate.code === 'INVALID_DURATION_MODE'));
});
check('FIXED requires a positive integer base and forbids areaBasis', () => {
  const issues = validateWorkPackageDurationMetadata({
    id: 'bad-fixed',
    duration: { mode: 'FIXED', baseDurationDays: 1.5, areaBasis: 'TOTAL_AREA' },
  });
  assert.ok(issues.some(candidate => candidate.code === 'INVALID_BASE_DURATION'));
  assert.ok(issues.some(candidate => candidate.code === 'UNEXPECTED_DURATION_AREA_BASIS'));
});
check('AREA_SCALED requires a supported canonical basis', () => {
  const issues = validateWorkPackageDurationMetadata({
    id: 'bad-area',
    duration: { mode: 'AREA_SCALED', baseDurationDays: 3, areaBasis: 'NONE' },
  });
  assert.ok(issues.some(candidate => candidate.code === 'INVALID_DURATION_AREA_BASIS'));
});
check('MILESTONE and EXCLUDED reject base duration and area basis', () => {
  for (const mode of ['MILESTONE', 'EXCLUDED']) {
    const issues = validateWorkPackageDurationMetadata({
      id: mode,
      duration: { mode, baseDurationDays: 1, areaBasis: 'TOTAL_AREA' },
    });
    assert.ok(issues.some(candidate => candidate.code === 'UNEXPECTED_BASE_DURATION'));
    assert.ok(issues.some(candidate => candidate.code === 'UNEXPECTED_DURATION_AREA_BASIS'));
  }
});
check('band validation requires a final unbounded band', () => {
  const invalid = structuredClone(FIXTURE_DURATION_MODEL);
  invalid.bands.at(-1).maxRatio = 3;
  assert.ok(validateDurationModel(invalid).some(candidate => candidate.code === 'INCOMPLETE_DURATION_BANDS'));
});
check('band bounds must be deterministic and strictly increasing', () => {
  const invalid = structuredClone(FIXTURE_DURATION_MODEL);
  invalid.bands[1].maxRatio = 0.4;
  assert.ok(validateDurationModel(invalid).some(candidate => candidate.code === 'OVERLAPPING_DURATION_BANDS'));
});
check('all three canonical reference areas are required and positive', () => {
  const invalid = structuredClone(FIXTURE_DURATION_MODEL);
  invalid.referenceAreas.BOH_AREA = 0;
  assert.ok(validateDurationModel(invalid).some(candidate => candidate.code === 'INVALID_REFERENCE_AREA'));
});
check('unknown duration fields, including procurement-style fields, are unsupported', () => {
  const issues = validateWorkPackageDurationMetadata({
    id: 'procurement-firewall',
    duration: { mode: 'FIXED', baseDurationDays: 2, procurementLeadDays: 60 },
  });
  assert.ok(issues.some(candidate => candidate.code === 'UNSUPPORTED_DURATION_FIELD'));
});

console.log('\nCanonical duration resolution');
check('FIXED duration is independent of all canonical project areas', () => {
  const small = resolve('fixture.electrical.distribution_panel', {
    storeSizeSqm: 1, salesAreaSqm: 1, backOfHouseAreaSqm: 1,
  });
  const large = resolve('fixture.electrical.distribution_panel', {
    storeSizeSqm: 99999, salesAreaSqm: 99999, backOfHouseAreaSqm: 99999,
  });
  assert.equal(small.durationDays, 4);
  assert.deepEqual(small, large);
  assert.equal(small.resolutionMode, DURATION_RESOLUTION_MODE.FIXED);
});
check('AREA_SCALED duration changes monotonically across governed bands', () => {
  const durations = [100, 400, 900, 1300].map(salesAreaSqm =>
    resolve('fixture.sales.painting', { salesAreaSqm }).durationDays);
  assert.deepEqual(durations, [6, 8, 10, 12]);
});
check('area scaling is damped rather than linear', () => {
  const small = resolve('fixture.sales.painting', { salesAreaSqm: 100 });
  const large = resolve('fixture.sales.painting', { salesAreaSqm: 1300 });
  assert.ok(large.durationDays / small.durationDays < 1300 / 100);
});
check('Sales fixture reads canonical SALES_AREA, not legacy scope.zoneAreas', () => {
  const result = resolve('fixture.sales.painting');
  assert.equal(result.canonicalArea, 600);
  assert.equal(result.areaBasis, 'SALES_AREA');
  assert.equal(result.durationDays, 10);
});
check('BOH fixture reads canonical BOH_AREA', () => {
  const result = resolve('fixture.boh.flooring');
  assert.equal(result.canonicalArea, 200);
  assert.equal(result.areaBasis, 'BOH_AREA');
  assert.equal(result.durationDays, 8);
});
check('Project-Wide fixture reads canonical TOTAL_AREA', () => {
  const result = resolve('fixture.project.ductwork');
  assert.equal(result.canonicalArea, 1000);
  assert.equal(result.areaBasis, 'TOTAL_AREA');
  assert.equal(result.durationDays, 12);
});
check('missing canonical area uses base duration with explicit fallback provenance', () => {
  const result = resolve('fixture.sales.painting', {});
  assert.equal(result.durationDays, 10);
  assert.equal(result.resolutionMode, DURATION_RESOLUTION_MODE.AREA_FALLBACK);
  assert.equal(result.canonicalArea, null);
  assert.equal(result.bandMultiplier, 1);
});
check('invalid canonical area uses the same explicit base fallback', () => {
  const result = resolve('fixture.boh.flooring', { backOfHouseAreaSqm: 'invalid' });
  assert.equal(result.durationDays, 8);
  assert.equal(result.resolutionMode, DURATION_RESOLUTION_MODE.AREA_FALLBACK);
});
check('zero remains a valid canonical area and selects the first band', () => {
  const result = resolve('fixture.sales.painting', { salesAreaSqm: 0 });
  assert.equal(result.canonicalArea, 0);
  assert.equal(result.areaRatio, 0);
  assert.equal(result.bandMultiplier, 0.6);
  assert.equal(result.durationDays, 6);
  assert.equal(result.resolutionMode, DURATION_RESOLUTION_MODE.AREA_BAND);
});
check('MILESTONE is a participating zero-day schedule fact', () => {
  const result = resolve('fixture.handover.final_inspection');
  assert.equal(result.durationDays, 0);
  assert.equal(result.scheduleParticipation, true);
  assert.equal(result.resolutionMode, DURATION_RESOLUTION_MODE.MILESTONE);
});
check('EXCLUDED is explicit non-participation, not a milestone', () => {
  const result = resolve('fixture.handover.om_documentation');
  assert.equal(result.durationDays, null);
  assert.equal(result.scheduleParticipation, false);
  assert.equal(result.resolutionMode, DURATION_RESOLUTION_MODE.EXCLUDED);
});

console.log('\nSelected-scope resolution');
check('selected scope retains milestones and explicitly identifies exclusions', () => {
  const resolved = resolveSelectedScopeDurations({
    workPackages: FIXTURE_WPS,
    selectedWpIds: [
      'fixture.electrical.distribution_panel',
      'fixture.sales.painting',
      'fixture.handover.final_inspection',
      'fixture.handover.om_documentation',
    ],
    durationModel: FIXTURE_DURATION_MODEL,
    project: FIXTURE_PROJECT,
  });
  assert.equal(resolved.results.length, 4);
  assert.equal(resolved.scheduleTasks.length, 3);
  assert.equal(resolved.excluded.length, 1);
  assert.ok(resolved.scheduleTasks.some(result => result.durationDays === 0));
});
check('unselected work packages do not appear or manufacture tasks', () => {
  const resolved = resolveSelectedScopeDurations({
    workPackages: FIXTURE_WPS,
    selectedWpIds: ['fixture.sales.painting'],
    durationModel: FIXTURE_DURATION_MODEL,
    project: FIXTURE_PROJECT,
  });
  assert.deepEqual(resolved.results.map(result => result.wpId), ['fixture.sales.painting']);
  assert.ok(!resolved.results.some(result => result.wpId === 'fixture.electrical.generator'));
});
check('unknown and duplicate selected ids fail instead of being silently reinterpreted', () => {
  assert.throws(() => resolveSelectedScopeDurations({
    workPackages: FIXTURE_WPS,
    selectedWpIds: ['missing'],
    durationModel: FIXTURE_DURATION_MODEL,
    project: FIXTURE_PROJECT,
  }), /absent from the resolved template/);
  assert.throws(() => resolveSelectedScopeDurations({
    workPackages: FIXTURE_WPS,
    selectedWpIds: ['fixture.sales.painting', 'fixture.sales.painting'],
    durationModel: FIXTURE_DURATION_MODEL,
    project: FIXTURE_PROJECT,
  }), /Duplicate selected/);
});

console.log('\nDuration / Progress Weight / procurement firewalls');
check('weight and classification metadata cannot change resolved duration', () => {
  const base = wp('fixture.sales.painting');
  const baseline = resolve('fixture.sales.painting', FIXTURE_PROJECT, base);
  for (const mutation of [
    { baseEffort: 999999 },
    { categoryFactor: 0.0001 },
    { catalogClass: 'specialized' },
    { durationPct: 0.00001 },
  ]) {
    const changed = resolve('fixture.sales.painting', FIXTURE_PROJECT, { ...base, ...mutation });
    assert.deepEqual(changed, baseline);
  }
});
check('contractor, cost, and procurement-like project facts cannot change duration', () => {
  const baseline = resolve('fixture.electrical.generator');
  const changed = resolve('fixture.electrical.generator', {
    ...FIXTURE_PROJECT,
    contractorCount: 100,
    actualCost: 999999999,
    procurementLeadDays: 365,
    shippingDays: 90,
  });
  assert.deepEqual(changed, baseline);
});
check('invalid duration contracts fail clearly through DurationContractError', () => {
  assert.throws(
    () => resolve('fixture.electrical.generator', FIXTURE_PROJECT, {
      id: 'fixture.electrical.generator',
      duration: { mode: 'FIXED' },
    }),
    error => error instanceof DurationContractError && error.issues.some(candidate => candidate.code === 'INVALID_BASE_DURATION'),
  );
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scheduleDir = __dirname;
const durationProduction = readdirSync(scheduleDir)
  .filter(name => name.endsWith('.js'))
  .map(name => readFileSync(path.join(scheduleDir, name), 'utf8'))
  .concat(readFileSync(path.resolve(__dirname, '../../engines/masterCatalogDurationEngine.js'), 'utf8'))
  .join('\n');
check('schema-v2 duration production code contains no Progress Weight metadata reads', () => {
  assert.doesNotMatch(durationProduction, /\b(baseEffort|categoryFactor|catalogClass|durationPct|progressWeight)\b/);
});
check('schema-v2 duration production contract declares no procurement timing fields', () => {
  assert.doesNotMatch(durationProduction, /\b(procurementLeadDays|manufacturingDays|shippingDays|deliveryDays)\b/);
});
check('schema-v2 Progress Weight path contains no duration-v2 metadata reads', () => {
  const progressSources = [
    '../../engines/masterCatalogWeightEngine.js',
    '../projects/weights/resolveProjectProgressWeights.js',
    '../projects/weights/buildMasterCatalogProgressTemplate.js',
  ].map(relative => readFileSync(path.resolve(__dirname, relative), 'utf8')).join('\n');
  assert.doesNotMatch(progressSources, /\b(baseDurationDays|durationModel|bandMultiplier|AREA_SCALED)\b/);
});

console.log('\nCanonical schema routing and real-candidate protection');
check('schemaVersion 1 routes only to certified legacy window fitting', () => {
  const v1 = materializeRetailFitoutV2TemplateData();
  const route = resolveProjectScheduleModel({ pinnedTemplate: { data: v1 } });
  assert.deepEqual(route, {
    schemaVersion: 1,
    route: PROJECT_SCHEDULE_ROUTE.LEGACY_WINDOW_FITTING,
    operational: true,
    issues: [],
    durationModel: null,
  });
});
check('operational schemaVersion 2 fixture routes to canonical duration v2', () => {
  const route = resolveProjectScheduleModel({ pinnedTemplate: { data: FIXTURE_TEMPLATE } });
  assert.equal(route.route, PROJECT_SCHEDULE_ROUTE.MASTER_CATALOG_DURATION_V2);
  assert.equal(route.operational, true);
  assert.equal(route.durationModel, FIXTURE_DURATION_MODEL);
});
check('real inactive 221-WP candidate remains explicitly unschedulable', () => {
  const realCandidate = materializeRetailFitoutMasterCatalogTemplateData();
  const route = resolveProjectScheduleModel({ pinnedTemplate: { data: realCandidate } });
  assert.equal(route.route, PROJECT_SCHEDULE_ROUTE.MASTER_CATALOG_DURATION_V2);
  assert.equal(route.operational, false);
  assert.equal(route.durationModel, null);
  assert.ok(route.issues.some(candidate => candidate.code === 'MISSING_DURATION_MODEL'));
  assert.ok(route.issues.some(candidate => candidate.code === 'MISSING_DURATION_METADATA'));
});
check('schemaVersion 1 certified 91-WP duration seeding remains unchanged', () => {
  const v1 = materializeRetailFitoutV2TemplateData();
  const seeded = buildProjectWPsV2(
    { sales: 600, boh: 200 },
    '2026-01-01',
    '2026-04-01',
    1000,
    { scopeTemplate: v1 },
  );
  assert.equal(seeded.length, 91);
  assert.ok(seeded.every(candidate => Number.isInteger(candidate.duration_days) && candidate.duration_days >= 1));
  assert.equal(v1.dependencies.length, 475);
  assert.deepEqual(v1.schedule, {
    completionMarkerWpId: 'common.commissioning.integrated_systems_test',
    openingMarkerWpId: 'common.handover.keys_possession',
  });
});

console.log(`\n-- RESULT: ${passed} passed, ${failed} failed --\n`);
process.exit(failed === 0 ? 0 : 1);
