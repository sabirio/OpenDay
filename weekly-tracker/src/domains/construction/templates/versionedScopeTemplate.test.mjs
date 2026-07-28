import { createHash } from 'node:crypto';
import {
  ALL_WORK_PACKAGES_V2,
  retailFitoutV2,
  V2_TEMPLATE_TYPE,
} from './retailFitoutV2.js';
import { DEPENDENCY_RULES_V2 } from '../../../config/dependencyRulesV2.js';
import {
  getScopeTemplateGrouping,
  materializeRetailFitoutV2TemplateData,
  resolveProjectScopeTemplate,
  RETAIL_FITOUT_V2_FAMILY,
  RETAIL_FITOUT_V2_WP_ID_SHA256,
  selectDefaultScopeTemplate,
} from './versionedScopeTemplate.js';
import { buildV2ProgressTemplate } from '../../../core/projects/weights/buildV2ProgressTemplate.js';
import { buildV2OpeningReadinessOptions } from '../../../core/projects/scope/buildV2OpeningReadinessOptions.js';
import { getScopedGanttWorkPackagesV2 } from '../../../core/projects/grouping/getWPGrouping.js';
import {
  buildProjectWPsV2,
  calculateGantt,
} from '../../../engines/ganttEngine.js';

let pass = 0;
let fail = 0;
function check(label, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  OK ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

function templateRecord({
  id,
  version,
  companyId = null,
  isActive = true,
  data = materializeRetailFitoutV2TemplateData(),
}) {
  return {
    id,
    name: `Retail Fit-Out V2 v${version}`,
    family: RETAIL_FITOUT_V2_FAMILY,
    familyId: 'test-family',
    companyId,
    version,
    isActive,
    data,
  };
}

const persistedData = materializeRetailFitoutV2TemplateData();
const persistedV1 = templateRecord({ id: 'template-v1', version: 1, data: persistedData });
const pinnedProject = {
  id: 1,
  templateType: V2_TEMPLATE_TYPE,
  templateId: persistedV1.id,
  scopeTemplate: persistedV1,
  scope: null,
};
const legacyProject = { id: 2, templateType: V2_TEMPLATE_TYPE, templateId: null, scope: null };
const pinned = resolveProjectScopeTemplate(pinnedProject);
const legacy = resolveProjectScopeTemplate(legacyProject);

console.log('\nversionedScopeTemplate - deterministic static-to-persisted materialization');
{
  const staticIds = ALL_WORK_PACKAGES_V2.map(wp => wp.id);
  const persistedIds = pinned.workPackages.map(wp => wp.id);
  const fingerprint = createHash('sha256').update(persistedIds.join('\n')).digest('hex');
  check('persisted template has the exact certified 91 WP ids in the same order',
    JSON.stringify(persistedIds) === JSON.stringify(staticIds) && persistedIds.length === 91);
  check('persisted WP-id fingerprint is unchanged',
    fingerprint === RETAIL_FITOUT_V2_WP_ID_SHA256);
  check('persisted template has the exact 3 zones and 23 categories',
    persistedData.zones.length === 3
      && persistedData.zones.flatMap(zone => zone.categories).length === 23);
  check('zone/category identity, labels, weights, and area basis are exact',
    JSON.stringify(persistedData.zones.map(zone => ({
      ...zone,
      categories: zone.categories.map(({ label: _label, workPackages: _wps, ...category }) => category),
    }))) === JSON.stringify(retailFitoutV2.zones));
  check('WP labels, duration shares, blockers, and readiness metadata are exact',
    JSON.stringify(pinned.workPackages.map(wp => ({
      id: wp.id,
      label: wp.label,
      durationPct: wp.durationPct,
      isBlocker: wp.isBlocker,
      openingBlocker: wp.openingBlocker,
      typicalClearDays: wp.typicalClearDays,
      responsibleRole: wp.responsibleRole,
      zoneId: wp.zoneId,
      categoryId: wp.categoryId,
    }))) === JSON.stringify(ALL_WORK_PACKAGES_V2.map(wp => ({
      id: wp.id,
      label: wp.label,
      durationPct: wp.durationPct,
      isBlocker: wp.isBlocker,
      openingBlocker: wp.openingBlocker,
      typicalClearDays: wp.typicalClearDays,
      responsibleRole: wp.responsibleRole,
      zoneId: wp.zoneId,
      categoryId: wp.categoryId,
    }))));
  check('all 475 dependency edges are exact',
    JSON.stringify(pinned.dependencies) === JSON.stringify(DEPENDENCY_RULES_V2)
      && pinned.dependencies.length === 475);
}

console.log('\nversionedScopeTemplate - legacy-static and persisted resolution equivalence');
{
  check('pinned V2 uses the persisted source', pinned.source === 'pinned');
  check('unpinned historical V2 uses the explicit legacy-static source', legacy.source === 'legacy-static');
  check('legacy and persisted grouping are identical',
    pinned.workPackages.every(wp =>
      JSON.stringify(getScopeTemplateGrouping(pinned.data, wp.id))
      === JSON.stringify(getScopeTemplateGrouping(legacy.data, wp.id))
    ));

  const zoneAreas = { common: 0, sales: 700, boh: 300 };
  const progressStatic = buildV2ProgressTemplate(zoneAreas, null, null, legacy);
  const progressPersisted = buildV2ProgressTemplate(zoneAreas, null, null, pinned);
  check('progress/weight adapter output is exact',
    JSON.stringify(progressPersisted) === JSON.stringify(progressStatic));
  check('normalized progress weights still total 100',
    Math.abs(progressPersisted.phases.reduce((sum, phase) => sum + phase.progressWeight, 0) - 100) < 0.001);

  const start = '2026-01-01';
  const end = '2026-05-01';
  const ganttStaticWps = buildProjectWPsV2(zoneAreas, start, end, 1000, { scopeTemplate: legacy });
  const ganttPersistedWps = buildProjectWPsV2(zoneAreas, start, end, 1000, { scopeTemplate: pinned });
  const ganttStatic = calculateGantt(ganttStaticWps, legacy.dependencies, start);
  const ganttPersisted = calculateGantt(ganttPersistedWps, pinned.dependencies, start);
  const projectSchedule = rows => rows.map(row => ({
    id: row.id,
    duration: row.duration_days,
    start: row.earlyStart.toISOString(),
    finish: row.earlyFinish.toISOString(),
  }));
  check('Gantt ids, durations, and generated dates are exact',
    JSON.stringify(projectSchedule(ganttPersisted)) === JSON.stringify(projectSchedule(ganttStatic)));

  const readinessStaticOptions = buildV2OpeningReadinessOptions(legacy);
  const readinessPersistedOptions = buildV2OpeningReadinessOptions(pinned);
  check('readiness/blocker adapter metadata is exact',
    JSON.stringify(readinessPersistedOptions) === JSON.stringify(readinessStaticOptions));
  const reportStatic = getScopedGanttWorkPackagesV2(null, legacy);
  const reportPersisted = getScopedGanttWorkPackagesV2(null, pinned);
  check('weekly/contractor report and site-visit scope adapters are exact',
    JSON.stringify(reportPersisted) === JSON.stringify(reportStatic)
      && reportPersisted.reduce((sum, category) => sum + category.tasks.length, 0) === 91);
}

console.log('\nversionedScopeTemplate - immutable project pinning and defaults');
{
  const v2Data = structuredClone(persistedData);
  const targetCategory = v2Data.zones[0].categories[0];
  targetCategory.label = 'Changed display metadata for v2 test';
  targetCategory.weight = targetCategory.weight + 1;
  targetCategory.workPackages[0].openingBlocker = 'soft';
  v2Data.dependencies = v2Data.dependencies.slice(1);
  const globalV2 = templateRecord({ id: 'template-v2', version: 2, data: v2Data });
  const inactiveV1 = { ...persistedV1, isActive: false };

  const projectA = resolveProjectScopeTemplate({
    ...pinnedProject,
    scopeTemplate: inactiveV1,
  });
  const selectedDefault = selectDefaultScopeTemplate([inactiveV1, globalV2], {
    companyId: 'company-a',
  });
  const projectB = resolveProjectScopeTemplate({
    id: 3,
    templateType: V2_TEMPLATE_TYPE,
    templateId: selectedDefault.id,
    scopeTemplate: selectedDefault,
  });

  check('Project A remains pinned to v1 after v2 becomes the default',
    projectA.id === persistedV1.id
      && projectA.data.zones[0].categories[0].label !== targetCategory.label);
  check('Project A keeps v1 grouping, weights, dependencies, and readiness metadata',
    projectA.data.zones[0].categories[0].weight !== targetCategory.weight
      && projectA.dependencies.length === 475
      && projectA.workPackages[0].openingBlocker !== targetCategory.workPackages[0].openingBlocker);
  check('new Project B resolves the newly selected v2 default', projectB.id === globalV2.id);

  const companyA = templateRecord({ id: 'company-a-v3', version: 3, companyId: 'company-a' });
  const companyB = templateRecord({ id: 'company-b-v4', version: 4, companyId: 'company-b' });
  check('company-specific active default wins over global',
    selectDefaultScopeTemplate([globalV2, companyA, companyB], { companyId: 'company-a' })?.id === companyA.id);
  check('global active default is used when no company-specific default exists',
    selectDefaultScopeTemplate([globalV2, companyB], { companyId: 'company-a' })?.id === globalV2.id);
  check('Company A never resolves Company B private default',
    selectDefaultScopeTemplate([companyB], { companyId: 'company-a' }) == null);
  check('invalid historical V2 pin is not reinterpreted as persisted V2',
    resolveProjectScopeTemplate({
      templateType: V2_TEMPLATE_TYPE,
      templateId: 'legacy-v1-template',
      scopeTemplate: { id: 'legacy-v1-template', data: { phases: [], workPackages: [] } },
    }).source === 'legacy-static');
  check('pinned database V1/custom templates remain supported',
    resolveProjectScopeTemplate({
      templateType: 'custom',
      templateId: 'legacy-v1-template',
      scopeTemplate: { id: 'legacy-v1-template', data: { phases: [], workPackages: [] } },
    }).source === 'pinned');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
