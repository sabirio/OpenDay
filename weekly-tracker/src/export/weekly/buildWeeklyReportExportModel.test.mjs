// buildWeeklyReportExportModel.test.mjs
// Verifies the export view model is a thin, non-recalculating adapter over
// canonical engines: every progress/readiness/risk number in the model must
// trace back to runOpenDayOrchestrator()'s own output, not a fresh
// calculation. Covers both a legacy (v1, phase-based) project and a v2
// (zoned Retail Fit-Out) project, plus missing-optional-field and
// determinism guarantees.

import { register } from 'node:module';
const loaderSrc = `export async function resolve(s,c,n){if(s.startsWith('.')&&!s.match(/\\.[mc]?js$/)){try{return await n(s+'.js',c)}catch{return n(s+'/index.js',c)}}return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { runOpenDayOrchestrator } = await import('../../core/canonical/index.js');
const { buildWeeklyReportExportModel } = await import('./buildWeeklyReportExportModel.js');
const { V2_TEMPLATE_TYPE } = await import('../../domains/construction/templates/retailFitoutV2.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
};

const CALC_AT = '2026-07-20T00:00:00.000Z';

// ── v1 (legacy, phase-based) fixture — real WP ids from masterTaskLibrary.js ──
const V1_PROJECT = {
  id: 'project-1',
  storeCode: 'AA0011',
  shoppingMallName: 'Sunrise Mall',
  city: 'Astana',
  country: 'Kazakhstan',
  projectManager: 'J. Smith',
  generalContractor: 'BuildCo LLC',
  targetOpeningDate: '2027-01-15',
  projectType: 'New Opening',
  constructionStartDate: '2026-01-01',
  constructionEndDate: '2026-12-31',
  scope: { workPackages: ['demo.strip_out', 'demo.structural'], zoneAreas: { sales: 700, back: 300 } },
  progressHistory: [{ id: 'h1', overall_progress: 20, recorded_at: '2026-07-01' }],
};

const V1_REPORT = {
  id: 'r1',
  projectId: 'project-1',
  reportingDate: '2026-07-14',
  submittedAt: '2026-07-14',
  workPackageStatuses: {
    demolition: {
      'Strip Out & Clear': { progress: 100, status: 'Completed' },
      'Structural Demolition': { progress: 50, status: 'In Progress' },
    },
  },
  photos: ['project-1/2026-07-14/photo1.jpg', 'project-1/2026-07-14/photo2.jpg'],
  risks: ['Coordination', 'Safety or External Factors'],
  riskOwners: ['General Contractor'],
  riskScale: 'Medium',
  riskDescription: 'Coordination delays with MEP subcontractor.',
  nextWeekTop3: '1) Frame walls\n2) MEP rough-in\n3) Inspections',
  weekAfterTop3: '1) Drywall\n2) Paint prep',
  activitiesBlocked: 'No',
  supportRequired: 'Yes',
  supportTypes: ['Approval'],
  supportDescription: 'Need landlord sign-off on facade change.',
  finalComments: 'Overall on track, minor coordination issues with MEP.',
};

function runV1() {
  const orchestrated = runOpenDayOrchestrator(
    { project: V1_PROJECT, contractorReports: [V1_REPORT], siteVisits: [], progressHistory: V1_PROJECT.progressHistory },
    { calculatedAt: CALC_AT }
  );
  const model = buildWeeklyReportExportModel({
    project: V1_PROJECT,
    report: V1_REPORT,
    prevReport: null,
    projectReports: [V1_REPORT],
    siteVisits: [],
    canonicalResult: orchestrated,
    overallProgress: orchestrated.progress.overallProgress,
    generatedAt: CALC_AT,
  });
  return { orchestrated, model };
}

console.log('\nbuildWeeklyReportExportModel — v1 (legacy phase) project');
{
  const { orchestrated, model } = runV1();

  check('document has stable contract fields', model.document.documentType === 'weekly-report' && model.document.version === 1);
  check('document.generatedAt uses the explicit input, not wall-clock time', model.document.generatedAt === CALC_AT);
  check('project section carries identity fields verbatim', model.project.storeCode === 'AA0011' && model.project.shoppingMallName === 'Sunrise Mall');
  check('reportingPeriod uses the report date', model.reportingPeriod.reportingDate === '2026-07-14');

  check('progress.overallProgress equals the orchestrator output, not a recomputation',
    model.progress.overallProgress === orchestrated.progress.overallProgress);
  check('progress.variance equals the canonical discrepancy variance',
    model.progress.variance === orchestrated.progress.variance);
  check('health.actualProgress mirrors progress.overallProgress (no second calculation)',
    model.health.actualProgress === model.progress.overallProgress);
  check('health.riskLevel comes from the canonical risk engine',
    model.health.riskLevel === orchestrated.compatibility.legacyState.riskScore.level);
  check('readiness.status comes straight from the canonical readiness engine',
    model.readiness.status === orchestrated.readiness.status);

  check('phases is a non-empty array of {id,name,pct,status}', Array.isArray(model.phases) && model.phases.length > 0 &&
    model.phases.every(p => typeof p.id === 'string' && typeof p.pct === 'number'));
  check('phases excludes out_of_scope entries', model.phases.every(p => p.status !== 'out_of_scope'));

  check('risks.assessment carries the report-level flat fields (not invented per-item objects)',
    JSON.stringify(model.risks.assessment.categories) === JSON.stringify(['Coordination', 'Safety or External Factors']) &&
    model.risks.assessment.scale === 'Medium');

  check('upcomingWork carries actual contractor-report field names verbatim',
    model.upcomingWork.nextWeekTop3 === V1_REPORT.nextWeekTop3 &&
    model.upcomingWork.weekAfterTop3 === V1_REPORT.weekAfterTop3 &&
    model.upcomingWork.supportRequired === 'Yes');

  check('evidence.photos passes through raw storage paths unsigned (signing happens at render time)',
    JSON.stringify(model.evidence.photos) === JSON.stringify(V1_REPORT.photos));
}

console.log('\nbuildWeeklyReportExportModel — determinism');
{
  const runA = runV1();
  const runB = runV1();
  check('same input produces byte-identical model (excluding nothing — generatedAt is pinned)',
    JSON.stringify(runA.model) === JSON.stringify(runB.model));
}

// ── v2 (zoned Retail Fit-Out) fixture — real category ids from retailFitoutV2.js ──
const V2_PROJECT = {
  id: 'project-2',
  storeCode: 'BB0022',
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
  id: 'r2',
  projectId: 'project-2',
  reportingDate: '2026-07-14',
  submittedAt: '2026-07-14',
  workPackageStatuses: {
    'common.demolition': {
      'Strip Out & Clear': { status: 'Completed', progress: 100 },
      'Structural Demolition': { status: 'In Progress', progress: 50 },
      'MEP Disconnection': { status: 'Not Started', progress: 0 },
    },
  },
  photos: [],
  risks: [],
};

console.log('\nbuildWeeklyReportExportModel — v2 (zoned) project respects category grouping');
{
  const orchestrated = runOpenDayOrchestrator(
    { project: V2_PROJECT, contractorReports: [V2_REPORT], siteVisits: [] },
    { calculatedAt: CALC_AT }
  );
  const model = buildWeeklyReportExportModel({
    project: V2_PROJECT,
    report: V2_REPORT,
    projectReports: [V2_REPORT],
    canonicalResult: orchestrated,
    overallProgress: orchestrated.progress.overallProgress,
    generatedAt: CALC_AT,
  });

  check('v2 phases are grouped by category id, not forced into a legacy phase id',
    model.phases.some(p => p.id === 'common.demolition'));
  check('v2 progress is still read from the canonical orchestrator output',
    model.progress.overallProgress === orchestrated.progress.overallProgress);
}

console.log('\nbuildWeeklyReportExportModel — missing optional fields do not crash export');
{
  check('no project / no report does not throw', (() => {
    try {
      const model = buildWeeklyReportExportModel({ project: null, report: null, canonicalResult: null, generatedAt: CALC_AT });
      return model.project === null && model.reportingPeriod.reportingDate === null &&
        model.upcomingWork === null && Array.isArray(model.phases) && model.phases.length === 0 &&
        Array.isArray(model.evidence.photos) && model.evidence.photos.length === 0;
    } catch { return false; }
  })());

  check('project present but report absent does not throw', (() => {
    try {
      const model = buildWeeklyReportExportModel({ project: V1_PROJECT, report: null, canonicalResult: null, generatedAt: CALC_AT });
      return model.project.storeCode === 'AA0011' && model.upcomingWork === null && model.readiness === null;
    } catch { return false; }
  })());

  check('report missing every optional narrative field does not throw', (() => {
    try {
      const bareReport = { id: 'r3', projectId: 'project-1', reportingDate: '2026-07-14' };
      const model = buildWeeklyReportExportModel({ project: V1_PROJECT, report: bareReport, canonicalResult: null, generatedAt: CALC_AT });
      return model.upcomingWork.nextWeekTop3 === null && model.risks.assessment.categories.length === 0 &&
        model.evidence.photos.length === 0;
    } catch { return false; }
  })());
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
