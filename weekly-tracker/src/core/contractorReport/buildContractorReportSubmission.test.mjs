// buildContractorReportSubmission.test.mjs - P0 fix regression: legacy
// (non-Gantt) projects must not silently drop workPackageStatuses out of
// wpProgressArray / overall_progress. Exercises the real composition
// function directly (pure, no I/O) rather than an isolated mapper.
// Run: node src/core/contractorReport/buildContractorReportSubmission.test.mjs
//
// buildContractorReportSubmission.js's own imports are extensionless
// (bundler-resolved at app runtime); plain node ESM needs the same
// specifier-rewriting loader contractorReportService.test.mjs /
// siteVisitAtomicService.test.mjs already use for this reason.
import { register } from 'node:module';
const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { buildContractorReportSubmission } = await import('./buildContractorReportSubmission.js');
const { adaptContractorReportToLegacy } = await import('./adaptContractorReportToLegacy.js');

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const project = {
  id: 950002,
  templateType: null,
  scope: null,
  storeCode: 'KZ-TEST-02',
  shoppingMallName: 'Mega Center',
  generalContractor: 'Test GC',
};

function legacyForm(overrides = {}) {
  return {
    reportingDate: '2026-07-15',
    currentPackages: ['preconstruction'],
    workPackageStatuses: {
      preconstruction: {
        'Site setup & hoarding': { status: 'Completed', progress: 0, comment: '' },
        'Temporary utilities':   { status: 'In Progress', progress: 0, comment: 'halfway' },
        'Shop drawings approval': { status: 'Not Started', progress: 0, comment: '' },
        'Material procurement':  { status: 'Not Applicable', progress: 0, comment: '' },
      },
    },
    projectScheduleStatus: 'On Track',
    ...overrides,
  };
}

const baseInput = {
  project,
  photoUrls: ['950002/2026-07/a.jpg'],
  prevReport: null,
  ganttTasks: [],
  ganttWpProgress: {},
  reports: [],
  currentPhases: ['Construction works'],
};

console.log('\nbuildContractorReportSubmission - legacy (non-Gantt) WP persistence (P0 fix)');

const result = buildContractorReportSubmission({ ...baseInput, form: legacyForm() });

// 1. Legacy workPackageStatuses produce structured WP rows.
check('produces one row per non-N/A task in the active package (3, not 4)', result.wpProgressArray.length === 3);
check('every row has a non-empty wpId', result.wpProgressArray.every(r => typeof r.wpId === 'string' && r.wpId.length > 0));
check('wpIds are unique (no duplicate WP rows on one submission)', new Set(result.wpProgressArray.map(r => r.wpId)).size === result.wpProgressArray.length);

const completedRow = result.wpProgressArray.find(r => r.wpId.includes('Site setup & hoarding'));
const inProgressRow = result.wpProgressArray.find(r => r.wpId.includes('Temporary utilities'));
const notStartedRow = result.wpProgressArray.find(r => r.wpId.includes('Shop drawings approval'));

check('Completed status maps to canonical db status + 100% effective progress', completedRow?.status === 'completed' && completedRow?.progress_pct === 100);
check('In Progress status maps to canonical db status + 50% effective progress', inProgressRow?.status === 'in_progress' && inProgressRow?.progress_pct === 50);
check('Not Started status maps to canonical db status + 0% effective progress', notStartedRow?.status === 'not_started' && notStartedRow?.progress_pct === 0);
check('carries the comment through', inProgressRow?.comment === 'halfway');
check('Not Applicable task produces no row at all', !result.wpProgressArray.some(r => r.wpId.includes('Material procurement')));

// 2. overall_progress is not unconditionally zero.
check('contractorRawAverageProgress is a real non-zero average, not 0', result.contractorRawAverageProgress > 0);
check('average matches (100 + 50 + 0) / 3 = 50', result.contractorRawAverageProgress === 50);

// 3. Explicit numeric progress wins over the status-derived score when present.
const explicitProgressForm = legacyForm({
  workPackageStatuses: {
    preconstruction: {
      'Site setup & hoarding': { status: 'In Progress', progress: 80, comment: '' },
    },
    demolition: {},
  },
});
const explicitResult = buildContractorReportSubmission({ ...baseInput, form: explicitProgressForm });
check('an explicit entry.progress > 0 overrides the status-derived score', explicitResult.wpProgressArray[0].progress_pct === 80);

// 4. Submitted statuses survive a read-back through the same adapter PM
//    comparison uses (buildWorkPackageStatuses / getGCTaskEntry's data source).
const adapted = adaptContractorReportToLegacy(
  { id: 900999, project_id: 950002, report_date: '2026-07-15', overall_progress: result.contractorRawAverageProgress },
  result.wpProgressArray.map(r => ({ wp_id: r.wpId, status: r.status, progress_pct: r.progress_pct, comment: r.comment })),
);
check('PM comparison adapter reconstructs the original legacy group id', adapted.workPackageStatuses.preconstruction != null);
check('PM comparison adapter reconstructs the original task name and status', adapted.workPackageStatuses.preconstruction['Site setup & hoarding']?.status === 'Completed');
check('PM comparison adapter reconstructs In Progress task unchanged', adapted.workPackageStatuses.preconstruction['Temporary utilities']?.status === 'In Progress');
check('adapter round-trip overall_progress matches the computed average', adapted.overallProgress === 50);

// 5. Empty status input remains safe.
const emptyForm = legacyForm({ workPackageStatuses: {}, currentPackages: ['preconstruction'] });
const emptyResult = buildContractorReportSubmission({ ...baseInput, form: emptyForm });
check('empty workPackageStatuses produces an empty array, not a crash', Array.isArray(emptyResult.wpProgressArray) && emptyResult.wpProgressArray.length === 0);
check('empty wpProgressArray falls back to cumulativeProgress, not NaN/undefined', typeof emptyResult.contractorRawAverageProgress === 'number' && !Number.isNaN(emptyResult.contractorRawAverageProgress));

const noPackagesForm = legacyForm({ currentPackages: [] });
const noPackagesResult = buildContractorReportSubmission({ ...baseInput, form: noPackagesForm });
check('missing currentPackages falls back to scanning all groups present in workPackageStatuses', noPackagesResult.wpProgressArray.length === 3);

// 6. Gantt submission behavior is unchanged.
console.log('\nbuildContractorReportSubmission - Gantt path regression (must be unaffected)');
const ganttProject = { ...project, templateType: null };
const ganttForm = { reportingDate: '2026-07-15', currentPackages: [], workPackageStatuses: {}, projectScheduleStatus: 'On Track' };
const ganttTasks = [
  { id: 'walls.framing', phaseId: 'rough_in', label: 'Wall Framing / Partitions', actual_progress: 100, status: 'completed' },
  { id: 'mep.electrical', phaseId: 'rough_in', label: 'Electrical Rough-In', actual_progress: 40, status: 'in_progress' },
];
const ganttWpProgress = {
  'walls.framing':  { progress_pct: 100, status: 'completed' },
  'mep.electrical': { progress_pct: 40,  status: 'in_progress' },
};
const ganttResult = buildContractorReportSubmission({
  ...baseInput, project: ganttProject, form: ganttForm, ganttTasks, ganttWpProgress,
});
check('Gantt path still keys wpProgressArray by the raw Gantt task id', ganttResult.wpProgressArray.every(r => ['walls.framing', 'mep.electrical'].includes(r.wpId)));
check('Gantt path wpProgressArray length matches ganttTasks length (2)', ganttResult.wpProgressArray.length === 2);
check('Gantt path average is (100+40)/2 = 70', ganttResult.contractorRawAverageProgress === 70);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
