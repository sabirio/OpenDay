// weeklyReportReviewModel.test.mjs — engine-audit regression (2026-07-16):
// buildWeeklyReportReviewModel() used to be v1-only (getScopedGanttWorkPackages
// filters v1's unprefixed WP ids against a v2 project's scope.workPackages,
// which is populated with v2's zone-prefixed dotted ids by
// ProjectScopeConfigurator.jsx — nothing matches, every phase's WP list
// empties, every phase is dropped), so Weekly Reports Review rendered
// completely empty (no tasks, no phase-change flags, null explain panel)
// for every v2 (zoned Retail Fit-Out) project despite the report actually
// containing real workPackageStatuses keyed by category id.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    try {
      return await nextResolve(specifier + '.js', context);
    } catch {
      return nextResolve(specifier + '/index.js', context);
    }
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { buildWeeklyReportReviewModel } = await import('./weeklyReportReviewModel.js');
const { V2_TEMPLATE_TYPE } = await import('../../domains/construction/templates/retailFitoutV2.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

// Real v2 WP ids/labels from CATEGORY_LIBRARY['common.demolition'] — see
// retailFitoutV2.js. scope.workPackages mirrors ProjectScopeConfigurator.jsx's
// real shape: an explicit array of active dotted v2 WP ids.
const V2_PROJECT = {
  id: 900,
  storeCode: 'V2-REVIEW-TEST',
  templateType: V2_TEMPLATE_TYPE,
  progressHistory: [],
  scope: {
    zoneAreas: { sales: 700, boh: 300 },
    zones: null,
    categories: null,
    workPackages: ['common.demolition.strip_out', 'common.demolition.structural', 'common.demolition.mep_disconnect'],
  },
};

const V2_REPORT = {
  id: 901,
  projectId: 900,
  reportingDate: '2026-07-01',
  submittedAt: '2026-07-01',
  workPackageStatuses: {
    'common.demolition': {
      'Strip Out & Clear':     { status: 'Completed',   progress: 100 },
      'Structural Demolition': { status: 'In Progress', progress: 50 },
      'MEP Disconnection':     { status: 'Not Started', progress: 0 },
    },
  },
  photos: [], risks: [],
};

console.log('\nbuildWeeklyReportReviewModel — v2 (zoned) project support');
{
  const result = buildWeeklyReportReviewModel({
    selectedProject: V2_PROJECT,
    selectedReport: V2_REPORT,
    prevReport: null,
    projectReports: [V2_REPORT],
    siteVisits: [],
    overallProgress: 50,
  });

  check('scopedGanttWPs is not empty for a v2 project (was the core bug)', result.scopedGanttWPs.length > 0);
  check('scopedGanttWPs is grouped by category id, not v1 phase id',
    result.scopedGanttWPs.some(wp => wp.id === 'common.demolition'));
  check('mergedStatuses has a real entry for the reported category',
    result.mergedStatuses['common.demolition'] !== undefined);
  check('mergedStatuses picked up the Completed task from the report',
    result.mergedStatuses['common.demolition']?.['Strip Out & Clear']?.status === 'Completed');
  check('phaseClassifications is not empty (was the core bug)', result.phaseClassifications.length > 0);
  check('phaseClassifications includes the reported category, not a v1 phase id',
    result.phaseClassifications.some(p => p.id === 'common.demolition'));
  check('explainResult resolved (was always null for v2 before the fix)', result.explainResult !== null);
}

console.log('\nbuildWeeklyReportReviewModel — v1 project unaffected (no regression)');
{
  const v1Project = { id: 1, storeCode: 'V1-01', templateType: null, progressHistory: [], scope: null };
  const v1Report = {
    id: 2, projectId: 1, reportingDate: '2026-07-01', submittedAt: '2026-07-01',
    workPackageStatuses: { demolition: { 'Strip Out & Clear': { status: 'Completed', progress: 100 } } },
    photos: [], risks: [],
  };
  const result = buildWeeklyReportReviewModel({
    selectedProject: v1Project,
    selectedReport: v1Report,
    prevReport: null,
    projectReports: [v1Report],
    siteVisits: [],
    overallProgress: 100,
  });

  check('v1 project still resolves a non-empty scopedGanttWPs', result.scopedGanttWPs.length > 0);
  check('v1 project scopedGanttWPs still uses unprefixed phase ids', result.scopedGanttWPs.some(wp => wp.id === 'demolition'));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
