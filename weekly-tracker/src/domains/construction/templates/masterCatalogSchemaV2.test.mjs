// masterCatalogSchemaV2.test.mjs — Slice 5C: Master Catalog contract
// foundation (schemaVersion 2 + explicit default-scope semantics).
//
// Uses a SMALL deterministic fixture catalog (5 work packages: A/B/C/D/E,
// defaultScope A/B/C) — deliberately NOT the real 221-WP Retail Fit-Out
// Master Catalog, which is out of scope for this slice.
//
// Run: node src/domains/construction/templates/masterCatalogSchemaV2.test.mjs

import {
  MASTER_CATALOG_SCHEMA_VERSION,
  SCOPE_TEMPLATE_SCHEMA_VERSION,
  RETAIL_FITOUT_V2_FAMILY,
  isVersionedV2TemplateData,
  isMasterCatalogTemplateData,
  validateMasterCatalogTemplateData,
  isMasterCatalogTemplateValid,
  getDefaultScopeWorkPackageIds,
  getTemplateContractVersion,
  getScopeTemplateWorkPackages,
  materializeRetailFitoutV2TemplateData,
  resolveV2TemplateData,
  resolveProjectScopeTemplate,
} from './versionedScopeTemplate.js';
import { getScopeWPIds, resolveProjectScopeSelection } from '../../../core/projects/scope/getScopeWPIds.js';
import { buildNewProjectDraft, PROJECT_SCOPE_NOT_CONFIGURED } from '../../../core/projects/scope/newProjectScopeOrchestration.js';
import { resolveResetProjectScopeSelection } from '../../../core/projects/areas/resolveProjectArea.js';
import { getScopedGanttWorkPackagesV2 } from '../../../core/projects/grouping/getWPGrouping.js';
import { buildProjectWPsV2 } from '../../../engines/ganttEngine.js';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  OK ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}`);
  }
}

// ── Fixture: small deterministic 5-WP catalog, NOT the real 221-WP catalog ──
const FIXTURE_ZONES = [
  {
    id: 'zone1',
    label: 'Zone 1',
    weightMode: 'fixed',
    fixedWeight: 100,
    categories: [
      {
        id: 'cat1',
        label: 'Cat 1',
        workPackages: [
          { id: 'A', label: 'WP A', durationPct: 20, catalogClass: 'core' },
          { id: 'B', label: 'WP B', durationPct: 20, catalogClass: 'core' },
          { id: 'C', label: 'WP C', durationPct: 20, catalogClass: 'core', applicabilityTags: { location: ['mall'] } },
          { id: 'D', label: 'WP D', durationPct: 20, catalogClass: 'optional' },
          { id: 'E', label: 'WP E', durationPct: 20, catalogClass: 'specialized', applicabilityTags: { system: ['sprinklered'] } },
        ],
      },
    ],
  },
];

function buildFixtureCatalogData(overrides = {}) {
  return {
    schemaVersion: MASTER_CATALOG_SCHEMA_VERSION,
    model: 'zoned',
    templateType: RETAIL_FITOUT_V2_FAMILY,
    label: 'Test Master Catalog (A-E)',
    zones: structuredClone(FIXTURE_ZONES),
    dependencies: [],
    defaultScope: { workPackageIds: ['A', 'B', 'C'] },
    ...overrides,
  };
}

function buildFixtureTemplateRecord(dataOverrides = {}) {
  return {
    id: 'fixture-catalog-v2',
    name: 'Test Master Catalog (A-E)',
    family: RETAIL_FITOUT_V2_FAMILY,
    familyId: 'fixture-family',
    companyId: null,
    version: 1,
    isActive: false,
    data: buildFixtureCatalogData(dataOverrides),
  };
}

// ── 1. schema v1 compatibility — byte-for-byte unchanged ────────────────────
console.log('\n1. schema v1 compatibility (unchanged)');
{
  const v1Data = materializeRetailFitoutV2TemplateData();
  check('v1 materialized data is still schemaVersion 1', v1Data.schemaVersion === SCOPE_TEMPLATE_SCHEMA_VERSION);
  check('v1 data still satisfies isVersionedV2TemplateData', isVersionedV2TemplateData(v1Data));
  check('v1 data does NOT satisfy isMasterCatalogTemplateData', !isMasterCatalogTemplateData(v1Data));
  check('getTemplateContractVersion resolves v1 data to 1', getTemplateContractVersion(v1Data) === SCOPE_TEMPLATE_SCHEMA_VERSION);
  check('certified v1 catalog is still 91 work packages', getScopeTemplateWorkPackages(v1Data).length === 91);

  const wps = getScopeTemplateWorkPackages(v1Data);
  check('v1 getScopeWPIds(null) still means full scope', getScopeWPIds(null, wps) === null);
  check('v1 getScopeWPIds(empty workPackages) still means full scope (legacy shorthand, unchanged)',
    getScopeWPIds({ workPackages: [] }, wps)?.length === wps.length);
  check('resolveProjectScopeSelection with no schemaVersion delegates unchanged to getScopeWPIds',
    resolveProjectScopeSelection({ scope: null, workPackages: wps, schemaVersion: undefined }) === null);
  check('resolveProjectScopeSelection with schemaVersion 1 delegates unchanged to getScopeWPIds',
    JSON.stringify(resolveProjectScopeSelection({ scope: { workPackages: [] }, workPackages: wps, schemaVersion: 1 }))
      === JSON.stringify(getScopeWPIds({ workPackages: [] }, wps)));
}

// ── 2. schema v2 structural + defaultScope validation ────────────────────────
console.log('\n2. schema v2 validation — defaultScope');
{
  const valid = buildFixtureCatalogData();
  check('valid fixture is a structurally valid Master Catalog template', isMasterCatalogTemplateData(valid));
  check('getTemplateContractVersion resolves valid fixture to 2', getTemplateContractVersion(valid) === MASTER_CATALOG_SCHEMA_VERSION);
  check('valid fixture has zero validation issues', validateMasterCatalogTemplateData(valid).length === 0);
  check('isMasterCatalogTemplateValid is true for the valid fixture', isMasterCatalogTemplateValid(valid));

  const unknownDefault = buildFixtureCatalogData({ defaultScope: { workPackageIds: ['A', 'Z'] } });
  const unknownIssues = validateMasterCatalogTemplateData(unknownDefault);
  check('unknown defaultScope work package id is rejected', unknownIssues.some(i => i.code === 'UNKNOWN_DEFAULT_SCOPE_ID'));
  check('template with unknown default id is invalid', !isMasterCatalogTemplateValid(unknownDefault));

  const dupDefault = buildFixtureCatalogData({ defaultScope: { workPackageIds: ['A', 'A', 'B'] } });
  const dupIssues = validateMasterCatalogTemplateData(dupDefault);
  check('duplicate defaultScope work package id is rejected', dupIssues.some(i => i.code === 'DUP_DEFAULT_SCOPE_ID'));

  const emptyDefault = buildFixtureCatalogData({ defaultScope: { workPackageIds: [] } });
  check('an EMPTY defaultScope.workPackageIds is structurally valid (not an error)',
    isMasterCatalogTemplateData(emptyDefault) && validateMasterCatalogTemplateData(emptyDefault).length === 0);
}

console.log('\n2b. schema v2 validation — catalogClass');
{
  const zonesWithBadClass = structuredClone(FIXTURE_ZONES);
  zonesWithBadClass[0].categories[0].workPackages[0].catalogClass = 'mandatory';
  const badClass = buildFixtureCatalogData({ zones: zonesWithBadClass });
  const issues = validateMasterCatalogTemplateData(badClass);
  check('invalid catalogClass value is rejected', issues.some(i => i.code === 'INVALID_CATALOG_CLASS'));

  const validClasses = buildFixtureCatalogData();
  check('core/optional/specialized catalogClass values are all accepted',
    validateMasterCatalogTemplateData(validClasses).every(i => i.code !== 'INVALID_CATALOG_CLASS'));
}

console.log('\n2c. schema v2 validation — applicabilityTags');
{
  const zonesWithBadDimension = structuredClone(FIXTURE_ZONES);
  zonesWithBadDimension[0].categories[0].workPackages[0].applicabilityTags = { climate: ['tropical'] };
  const badDimension = buildFixtureCatalogData({ zones: zonesWithBadDimension });
  check('unknown applicabilityTags dimension is rejected',
    validateMasterCatalogTemplateData(badDimension).some(i => i.code === 'UNKNOWN_APPLICABILITY_DIMENSION'));

  const zonesWithBadValue = structuredClone(FIXTURE_ZONES);
  zonesWithBadValue[0].categories[0].workPackages[0].applicabilityTags = { location: ['moon_base'] };
  const badValue = buildFixtureCatalogData({ zones: zonesWithBadValue });
  check('unsupported applicabilityTags value is rejected',
    validateMasterCatalogTemplateData(badValue).some(i => i.code === 'UNKNOWN_APPLICABILITY_VALUE'));

  const valid = buildFixtureCatalogData();
  check('controlled-vocabulary applicabilityTags values are accepted',
    validateMasterCatalogTemplateData(valid).every(i => i.code !== 'UNKNOWN_APPLICABILITY_VALUE' && i.code !== 'UNKNOWN_APPLICABILITY_DIMENSION'));
}

// ── 3. resolveProjectScopeTemplate / resolveV2TemplateData resolve a real ───
//    pinned schemaVersion-2 template (regression: these used to gate on
//    v1-only isVersionedV2TemplateData and would silently fall back to the
//    static v1 catalog for any pinned v2 template) ───────────────────────────
console.log('\n3. pinned schema-v2 template resolution (regression coverage)');
{
  const fixtureTemplate = buildFixtureTemplateRecord();
  const resolvedData = resolveV2TemplateData(fixtureTemplate);
  check('resolveV2TemplateData resolves a pinned v2 template to ITS OWN data, not the static v1 fallback',
    resolvedData.schemaVersion === MASTER_CATALOG_SCHEMA_VERSION
    && resolvedData.zones[0].categories[0].workPackages.length === 5);

  const resolved = resolveProjectScopeTemplate({ templateId: fixtureTemplate.id, scopeTemplate: fixtureTemplate });
  check('resolveProjectScopeTemplate resolves a pinned v2 template\'s full 5-WP catalog',
    resolved?.workPackages?.length === 5
    && resolved.workPackages.map(wp => wp.id).sort().join(',') === 'A,B,C,D,E');
  check('resolveProjectScopeTemplate preserves data.schemaVersion for the pinned v2 template',
    resolved?.data?.schemaVersion === MASTER_CATALOG_SCHEMA_VERSION);
}

// ── 4. new-project default materialization ───────────────────────────────────
console.log('\n4. new-project default materialization');
{
  const fixtureTemplate = buildFixtureTemplateRecord();
  const draft = buildNewProjectDraft({ name: 'Test Project' }, fixtureTemplate);
  check('new project pinned to a schema-v2 template gets an explicit scope (not null)', draft.scope !== null);
  check('new project scope.workPackages materializes exactly the catalog\'s default 3 (A/B/C), not D/E',
    JSON.stringify([...draft.scope.workPackages].sort()) === JSON.stringify(['A', 'B', 'C']));
  check('new project is pinned to the exact template id', draft.templateId === fixtureTemplate.id);

  let threw = false;
  try { buildNewProjectDraft({}, { id: 'x', family: 'not-retail-fitout-v2' }); } catch (e) { threw = e.message === PROJECT_SCOPE_NOT_CONFIGURED; }
  check('a non-retail-fitout-v2 family still throws PROJECT_SCOPE_NOT_CONFIGURED (v1 behavior untouched)', threw);
}

// ── 5. explicit empty selection — never expands to full catalog ─────────────
console.log('\n5. empty selection (schema v2)');
{
  const fixtureTemplate = buildFixtureTemplateRecord();
  const catalogWPs = resolveProjectScopeTemplate({ templateId: fixtureTemplate.id, scopeTemplate: fixtureTemplate }).workPackages;
  const selection = resolveProjectScopeSelection({
    scope: { workPackages: [] },
    workPackages: catalogWPs,
    schemaVersion: MASTER_CATALOG_SCHEMA_VERSION,
  });
  check('explicit empty scope.workPackages resolves to ZERO selected ids (never the full 5-WP catalog)',
    Array.isArray(selection) && selection.length === 0);

  const nullScopeSelection = resolveProjectScopeSelection({
    scope: null,
    workPackages: catalogWPs,
    schemaVersion: MASTER_CATALOG_SCHEMA_VERSION,
  });
  check('null/absent scope ALSO resolves to zero for schema v2 (no ambiguous truthiness shortcut to "full")',
    Array.isArray(nullScopeSelection) && nullScopeSelection.length === 0);
}

// ── 6. explicit selection ────────────────────────────────────────────────────
console.log('\n6. explicit selection (schema v2)');
{
  const fixtureTemplate = buildFixtureTemplateRecord();
  const catalogWPs = resolveProjectScopeTemplate({ templateId: fixtureTemplate.id, scopeTemplate: fixtureTemplate }).workPackages;
  const selection = resolveProjectScopeSelection({
    scope: { workPackages: ['A', 'D'] },
    workPackages: catalogWPs,
    schemaVersion: MASTER_CATALOG_SCHEMA_VERSION,
  });
  check('explicit selection [A, D] resolves to exactly those two, not the 3-item default',
    JSON.stringify(selection) === JSON.stringify(['A', 'D']));

  const withUnknownId = resolveProjectScopeSelection({
    scope: { workPackages: ['A', 'ZZZ'] },
    workPackages: catalogWPs,
    schemaVersion: MASTER_CATALOG_SCHEMA_VERSION,
  });
  check('an id not present in the catalog is silently dropped, never inflated', JSON.stringify(withUnknownId) === JSON.stringify(['A']));
}

// ── 7. reset-to-default ──────────────────────────────────────────────────────
console.log('\n7. reset-to-default (schema v2)');
{
  const fixtureTemplate = buildFixtureTemplateRecord();
  const customizedProject = { scope: { workPackages: ['A', 'D'] } };
  const reset = resolveResetProjectScopeSelection(customizedProject, fixtureTemplate);
  check('reset-to-default restores the template\'s defaultScope (A/B/C)',
    JSON.stringify([...reset.workPackages].sort()) === JSON.stringify(['A', 'B', 'C']));
  check('reset-to-default does NOT restore the prior customization (A/D)',
    JSON.stringify([...reset.workPackages].sort()) !== JSON.stringify(['A', 'D']));
  check('reset-to-default does NOT select the full 5-item catalog',
    reset.workPackages.length !== 5);

  const v1Project = { scope: { workPackages: ['x', 'y'] } };
  const v1Template = { data: materializeRetailFitoutV2TemplateData() };
  check('reset-to-default for a schemaVersion-1 template is byte-for-byte clearProjectScopeSelection (resets to null/full)',
    resolveResetProjectScopeSelection(v1Project, v1Template) === null);
}

// ── 8. template immutability ─────────────────────────────────────────────────
console.log('\n8. template immutability');
{
  const fixtureTemplate = buildFixtureTemplateRecord();
  const originalSnapshot = JSON.stringify(fixtureTemplate.data.defaultScope.workPackageIds);

  const draft = buildNewProjectDraft({}, fixtureTemplate);
  draft.scope.workPackages.push('D');
  draft.scope.workPackages.length = 0;

  const resetSelection = resolveResetProjectScopeSelection({ scope: { workPackages: ['A'] } }, fixtureTemplate);
  resetSelection.workPackages.push('ZZZ');

  check('mutating a materialized project scope array never mutates template.data.defaultScope.workPackageIds',
    JSON.stringify(fixtureTemplate.data.defaultScope.workPackageIds) === originalSnapshot);
  check('getDefaultScopeWorkPackageIds returns a fresh array each call, not the template\'s own reference',
    getDefaultScopeWorkPackageIds(fixtureTemplate.data) !== fixtureTemplate.data.defaultScope.workPackageIds);
}

// ── 9. selected-only Gantt ───────────────────────────────────────────────────
console.log('\n9. selected-only Gantt task generation');
{
  const fixtureTemplate = buildFixtureTemplateRecord();
  const start = new Date('2025-01-01');
  const end = new Date('2025-06-01');
  const zoneAreas = { zone1: 500 };

  const fullScope = buildProjectWPsV2(zoneAreas, start, end, 1000, { scopeTemplate: fixtureTemplate, selectedWPIds: null });
  check('null selectedWPIds (no filter) generates all 5 catalog work packages',
    fullScope.length === 5);

  const threeSelected = buildProjectWPsV2(zoneAreas, start, end, 1000, { scopeTemplate: fixtureTemplate, selectedWPIds: ['A', 'B', 'C'] });
  check('selectedWPIds [A,B,C] generates exactly those 3 tasks, D and E never reach the schedule',
    threeSelected.length === 3 && threeSelected.map(wp => wp.id).sort().join(',') === 'A,B,C');

  const emptySelected = buildProjectWPsV2(zoneAreas, start, end, 1000, { scopeTemplate: fixtureTemplate, selectedWPIds: [] });
  check('explicit empty selectedWPIds generates ZERO tasks (regression: used to silently fall back to all 5)',
    emptySelected.length === 0);
}

// ── 10. selected-only report/display grouping ────────────────────────────────
console.log('\n10. selected-only report/display');
{
  const fixtureTemplate = buildFixtureTemplateRecord();
  const grouped = getScopedGanttWorkPackagesV2({ workPackages: ['A', 'B', 'C'] }, fixtureTemplate);
  const allTaskNames = grouped.flatMap(g => g.tasks.map(t => t.name));
  check('display grouping surfaces exactly the 3 selected work packages',
    allTaskNames.length === 3);
  check('display grouping never surfaces a deselected work package (D)',
    !allTaskNames.includes('WP D'));

  const emptyGrouped = getScopedGanttWorkPackagesV2({ workPackages: [] }, fixtureTemplate);
  const emptyTaskNames = emptyGrouped.flatMap(g => g.tasks.map(t => t.name));
  check('explicit empty selection surfaces zero work packages in the display grouping (not the full 5)',
    emptyTaskNames.length === 0);
}

// ── 11. legacy certification — existing 91-WP v1 project is unaffected ──────
console.log('\n11. legacy v1 project certification (unaffected by this slice)');
{
  const v1Data = materializeRetailFitoutV2TemplateData();
  const v1Template = { id: 'v1-real', family: RETAIL_FITOUT_V2_FAMILY, data: v1Data };
  const resolved = resolveProjectScopeTemplate({ templateId: v1Template.id, scopeTemplate: v1Template });
  check('a real, unscoped v1 project still resolves the full certified 91-WP catalog',
    resolved.workPackages.length === 91);

  const unscopedSelection = resolveProjectScopeSelection({
    scope: null,
    workPackages: resolved.workPackages,
    schemaVersion: resolved.data.schemaVersion,
  });
  check('an unscoped v1 project selection is still null (full scope) — completely unchanged by Slice 5C',
    unscopedSelection === null);

  const start = new Date('2025-01-01');
  const end = new Date('2025-09-01');
  const fullBuild = buildProjectWPsV2({}, start, end, 1000);
  check('v1 default buildProjectWPsV2 (no options) still generates all 91 certified work packages',
    fullBuild.length === 91);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
