// dashboardProjectRowsModel.test.mjs — Simplification Phase 3D.1 (live
// approved-commitment projection). Proves that buildCanonicalProjectRows(),
// given a real scheduleCommitmentProjection map (the shape
// loadScheduleCommitmentProjection.js produces), threads an Approved
// Baseline's facts all the way through the REAL runOpenDayOrchestrator ->
// evaluateProjectState -> engines chain — not just at the unit level.

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

const { buildCanonicalProjectRows } = await import('./dashboardProjectRowsModel.js');
const { buildScheduleCommitmentProjection } = await import('../schedule/scheduleCommitmentBatchProjection.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

function project(overrides = {}) {
  return {
    id: 'cm-project-1',
    companyId: 'org-1',
    constructionStartDate: null,
    constructionEndDate: null,
    targetOpeningDate: '2027-06-01',
    scope: { workPackages: ['demo.strip_out'], zoneAreas: {} },
    progressHistory: [],
    scheduleOwnershipMode: 'CONTRACTOR_MANAGED',
    ...overrides,
  };
}

const CALCULATED_AT = '2027-01-20T00:00:00.000Z';

console.log('\nNo projection supplied -> conservative default (regression net, matches pre-live-wiring behavior)');
{
  const rows = buildCanonicalProjectRows({ projects: [project()], reports: [], siteVisits: [], calculatedAt: CALCULATED_AT });
  const row = rows[0];
  check('commitmentState is NOT_YET_COMMITTED', row.commitmentState === 'NOT_YET_COMMITTED');
  check('assessmentAvailability is NOT_ASSESSABLE', row.assessmentAvailability === 'NOT_ASSESSABLE');
  check('missingReport is false, not fabricated', row.missingReport === false);
  check('readiness.status is Not Assessable', row.readiness.status === 'Not Assessable');
  check('scheduleProjectionAvailability is null (never asked), not "AVAILABLE" (never falsely claims a confirmed lookup)', row.scheduleProjectionAvailability === null);
}

console.log('\nProjection Completeness Hardening: projection Map supplied, but THIS project id is absent from it');
{
  // Simulates the transient window before the projection's own fetch has
  // resolved for this specific project (or any other id-set mismatch) — a
  // missing entry must not be presented as a confirmed NO_VERSION lookup.
  const rows = buildCanonicalProjectRows({
    projects: [project({ id: 'cm-not-in-projection' })],
    reports: [], siteVisits: [], calculatedAt: CALCULATED_AT,
    scheduleCommitmentProjection: new Map([['some-other-project-id', { projectionAvailability: 'AVAILABLE', commitmentState: 'COMMITTED' }]]),
  });
  const row = rows[0];
  check('commitmentState still falls back to the engine\'s own conservative default', row.commitmentState === 'NOT_YET_COMMITTED');
  check('scheduleProjectionAvailability is null, NOT "AVAILABLE" — never proven, not confirmed NO_VERSION', row.scheduleProjectionAvailability === null);
}

console.log('\nProjection Completeness Hardening: an explicit UNAVAILABLE entry never fabricates COMMITTED, and stays visible on the row');
{
  const rows = buildCanonicalProjectRows({
    projects: [project({ id: 'cm-unavailable' })],
    reports: [], siteVisits: [], calculatedAt: CALCULATED_AT,
    scheduleCommitmentProjection: new Map([['cm-unavailable', {
      projectionAvailability: 'UNAVAILABLE', lifecycleStatus: null, commitmentState: null,
      approvedVersionId: 'v-unknown', approvedAt: null, earliestCommittedPlannedStart: null, baselineRevisionNumber: null,
    }]]),
  });
  const row = rows[0];
  check('scheduleProjectionAvailability is UNAVAILABLE, carried onto the row (never silently dropped)', row.scheduleProjectionAvailability === 'UNAVAILABLE');
  check('commitmentState never becomes a fabricated COMMITTED from a null lifecycle status', row.commitmentState === 'NOT_YET_COMMITTED');
  check('readiness never fabricates Ready/At Risk/Critical from unavailable data', row.readiness.status === 'Not Assessable');
}

console.log('\nProjection has an APPROVED entry, obligation start already passed -> live COMMITTED transition proven');
{
  const projects = [project()];
  const projection = buildScheduleCommitmentProjection(
    projects,
    [{ id: 'v1', projectId: 'cm-project-1', submissionNumber: 1, status: 'APPROVED', reviewedAt: '2027-01-05T00:00:00Z', baselineRevisionNumber: 1 }],
    [{ versionId: 'v1', plannedStart: '2027-01-10' }],
  );
  const rows = buildCanonicalProjectRows({ projects, reports: [], siteVisits: [], calculatedAt: CALCULATED_AT, scheduleCommitmentProjection: projection });
  const row = rows[0];
  check('commitmentState is COMMITTED (real Approved Baseline, not the conservative default)', row.commitmentState === 'COMMITTED');
  check('assessmentAvailability is ASSESSABLE', row.assessmentAvailability === 'ASSESSABLE');
  check('readiness.status is no longer "Not Assessable"', row.readiness.status !== 'Not Assessable');
  // obligation start = max(2027-01-05, 2027-01-10) = 2027-01-10; reference
  // 2027-01-20 is 10 days later -> no report submitted -> OVERDUE.
  check('reportDueState reflects the real obligation start (OVERDUE, 10 days after obligation start with no report)', row.reportDueState === 'OVERDUE');
  check('missingReport is true (a real obligation now genuinely exists and was missed)', row.missingReport === true);
}

console.log('\nProjection has a PENDING_REVIEW entry -> PROPOSED, still not a commitment');
{
  const projects = [project({ id: 'cm-project-2' })];
  const projection = buildScheduleCommitmentProjection(
    projects,
    [{ id: 'v2', projectId: 'cm-project-2', submissionNumber: 1, status: 'PENDING_REVIEW' }],
    [],
  );
  const rows = buildCanonicalProjectRows({ projects, reports: [], siteVisits: [], calculatedAt: CALCULATED_AT, scheduleCommitmentProjection: projection });
  const row = rows[0];
  check('commitmentState is PROPOSED', row.commitmentState === 'PROPOSED');
  check('assessmentAvailability is still NOT_ASSESSABLE (a proposal can still be sent back)', row.assessmentAvailability === 'NOT_ASSESSABLE');
  check('missingReport is false', row.missingReport === false);
}

console.log('\nCOMMITTED project with real evidence of deviation -> genuine risk is visible, not permanently neutral');
{
  const projects = [project({ id: 'cm-project-3' })];
  const projection = buildScheduleCommitmentProjection(
    projects,
    [{ id: 'v3', projectId: 'cm-project-3', submissionNumber: 1, status: 'APPROVED', reviewedAt: '2027-01-05T00:00:00Z', baselineRevisionNumber: 1 }],
    [{ versionId: 'v3', plannedStart: '2027-01-05' }],
  );
  const badReport = {
    id: 'r-bad', projectId: 'cm-project-3', reportingDate: '2027-01-18', submittedAt: '2027-01-18',
    projectScheduleStatus: 'Delayed', activitiesBlocked: 'Yes', riskScale: 'High', risks: ['a', 'b', 'c'],
    workPackageStatuses: { demolition: { 'Strip Out & Clear': { status: 'Not Started', progress: 0 } } },
  };
  const rows = buildCanonicalProjectRows({ projects, reports: [badReport], siteVisits: [], calculatedAt: CALCULATED_AT, scheduleCommitmentProjection: projection });
  const row = rows[0];
  check('commitmentState is COMMITTED', row.commitmentState === 'COMMITTED');
  check('a real submitted report is scored normally, not swallowed by NOT_ASSESSABLE', row.riskScore.assessmentAvailability === 'ASSESSABLE');
  check('genuine risk factors are visible (Delayed/blocked/high risk scale)', row.riskScore.score > 0 && row.riskScore.factors.length > 0);
  check('riskLevel is not the neutral LOW a not-yet-committed project would show', row.riskLevel !== 'LOW');
}

console.log('\nAUTO_GENERATED project is fully unaffected by the projection wiring (backward compatibility)');
{
  const projects = [project({ id: 'ag-project-1', scheduleOwnershipMode: 'AUTO_GENERATED' })];
  const projection = buildScheduleCommitmentProjection(projects, [], []);
  const rowWithProjection = buildCanonicalProjectRows({ projects, reports: [], siteVisits: [], calculatedAt: CALCULATED_AT, scheduleCommitmentProjection: projection })[0];
  const rowWithoutProjection = buildCanonicalProjectRows({ projects, reports: [], siteVisits: [], calculatedAt: CALCULATED_AT })[0];
  check('commitmentState is COMMITTED with a projection supplied', rowWithProjection.commitmentState === 'COMMITTED');
  check('identical missingReport with/without a projection supplied', rowWithProjection.missingReport === rowWithoutProjection.missingReport);
  check('identical readiness.status with/without a projection supplied', rowWithProjection.readiness.status === rowWithoutProjection.readiness.status);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
