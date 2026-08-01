import assert from 'node:assert/strict';
import {
  buildContractorWorkspaceSummary,
  computeContractorWorkspaceRows,
  CONTRACTOR_WORKSPACE_FILTERS,
  filterContractorWorkspaceRows,
  rowNeedsAttention,
} from './contractorWorkspaceEngine.js';

let passed = 0;
const check = (n, f) => { f(); passed++; console.log(`  PASS ${n}`); };

const NOW = new Date('2026-07-22T00:00:00Z');
const actor = { id: 'contractor-1', role: 'Contractor' };

const projectA = { id: 1, targetOpeningDate: '2026-08-01' }; // 10 days out
const projectB = { id: 2, targetOpeningDate: '2026-09-20' }; // 60 days out
const projectC = { id: 3, targetOpeningDate: null };

check('no reports at all -> missingReport true, no crash on daysSinceReport', () => {
  const [row] = computeContractorWorkspaceRows([projectA], {}, {}, actor, NOW);
  assert.equal(row.latestReport, null);
  assert.equal(row.missingReport, true);
  assert.equal(row.daysSinceReport, null);
});

check('recent report (3 days ago) -> not missing', () => {
  const reports = { 1: [{ projectId: 1, reportingDate: '2026-07-19' }] };
  const [row] = computeContractorWorkspaceRows([projectA], reports, {}, actor, NOW);
  assert.equal(row.missingReport, false);
  assert.equal(row.daysSinceReport, 3);
});

check('stale report (10 days ago) -> missing', () => {
  const reports = { 1: [{ projectId: 1, reportingDate: '2026-07-12' }] };
  const [row] = computeContractorWorkspaceRows([projectA], reports, {}, actor, NOW);
  assert.equal(row.missingReport, true);
  assert.equal(row.daysSinceReport, 10);
});

check('picks the most recent of several reports, not the first/last in array order', () => {
  const reports = { 1: [
    { projectId: 1, reportingDate: '2026-07-01' },
    { projectId: 1, reportingDate: '2026-07-20' },
    { projectId: 1, reportingDate: '2026-07-10' },
  ] };
  const [row] = computeContractorWorkspaceRows([projectA], reports, {}, actor, NOW);
  assert.equal(row.daysSinceReport, 2);
});

check('daysToOpening reflects targetOpeningDate; null when project has none', () => {
  const [rowA] = computeContractorWorkspaceRows([projectA], {}, {}, actor, NOW);
  const [rowC] = computeContractorWorkspaceRows([projectC], {}, {}, actor, NOW);
  assert.equal(rowA.daysToOpening, 10);
  assert.equal(rowC.daysToOpening, null);
});

check('actionable snag: ASSIGNED to this contractor counts (can start work)', () => {
  const snags = { 1: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED' }] };
  const [row] = computeContractorWorkspaceRows([projectA], {}, snags, actor, NOW);
  assert.equal(row.actionableSnagCount, 1);
});

check('actionable snag: IN_PROGRESS assigned to this contractor counts (can mark ready)', () => {
  const snags = { 1: [{ status: 'IN_PROGRESS', assigneeId: 'contractor-1', publicationState: 'PUBLISHED' }] };
  const [row] = computeContractorWorkspaceRows([projectA], {}, snags, actor, NOW);
  assert.equal(row.actionableSnagCount, 1);
});

check('snag assigned to a different contractor does not count', () => {
  const snags = { 1: [{ status: 'ASSIGNED', assigneeId: 'someone-else', publicationState: 'PUBLISHED' }] };
  const [row] = computeContractorWorkspaceRows([projectA], {}, snags, actor, NOW);
  assert.equal(row.actionableSnagCount, 0);
});

check('READY_FOR_REVIEW assigned to this contractor still counts (can still add evidence while PM reviews)', () => {
  const snags = { 1: [{ status: 'READY_FOR_REVIEW', assigneeId: 'contractor-1', publicationState: 'PUBLISHED' }] };
  const [row] = computeContractorWorkspaceRows([projectA], {}, snags, actor, NOW);
  assert.equal(row.actionableSnagCount, 1);
});

check('CLOSED snag never counts, even if assigned to this contractor', () => {
  const snags = { 1: [{ status: 'CLOSED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED' }] };
  const [row] = computeContractorWorkspaceRows([projectA], {}, snags, actor, NOW);
  assert.equal(row.actionableSnagCount, 0);
});

check('unassigned OPEN snag does not count for a contractor (nothing to act on yet)', () => {
  const snags = { 1: [{ status: 'OPEN', assigneeId: null, publicationState: 'PUBLISHED' }] };
  const [row] = computeContractorWorkspaceRows([projectA], {}, snags, actor, NOW);
  assert.equal(row.actionableSnagCount, 0);
});

check('sort: missing/overdue report always sorts before a project with no snags or urgency', () => {
  const reports = { 2: [{ projectId: 2, reportingDate: '2026-07-20' }] }; // B has a recent report
  // A has no report at all (missing), B does not -> A must sort first regardless of dates
  const rows = computeContractorWorkspaceRows([projectB, projectA], reports, {}, actor, NOW);
  assert.equal(rows[0].project.id, 1);
  assert.equal(rows[1].project.id, 2);
});

check('sort: among equally-current reports, more actionable snags sorts first', () => {
  const reports = {
    1: [{ projectId: 1, reportingDate: '2026-07-21' }],
    2: [{ projectId: 2, reportingDate: '2026-07-21' }],
  };
  const snags = { 2: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED' }] };
  const rows = computeContractorWorkspaceRows([projectA, projectB], reports, snags, actor, NOW);
  assert.equal(rows[0].project.id, 2);
  assert.equal(rows[1].project.id, 1);
});

check('sort: with no missing report and no snags, nearer opening date sorts first', () => {
  const reports = {
    1: [{ projectId: 1, reportingDate: '2026-07-21' }],
    2: [{ projectId: 2, reportingDate: '2026-07-21' }],
  };
  const rows = computeContractorWorkspaceRows([projectB, projectA], reports, {}, actor, NOW);
  assert.equal(rows[0].project.id, 1); // projectA opens sooner
  assert.equal(rows[1].project.id, 2);
});

check('projects with no snags/reports entries for their id do not throw', () => {
  const rows = computeContractorWorkspaceRows([projectA, projectB, projectC], {}, {}, actor, NOW);
  assert.equal(rows.length, 3);
});

// ── overdueSnagCount ────────────────────────────────────────────────────

check('overdue: actionable snag with a past dueDate counts as overdue', () => {
  const snags = { 1: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: '2026-07-01' }] };
  const [row] = computeContractorWorkspaceRows([projectA], {}, snags, actor, NOW);
  assert.equal(row.actionableSnagCount, 1);
  assert.equal(row.overdueSnagCount, 1);
});

check('overdue: actionable snag with a future dueDate does not count as overdue', () => {
  const snags = { 1: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: '2026-12-01' }] };
  const [row] = computeContractorWorkspaceRows([projectA], {}, snags, actor, NOW);
  assert.equal(row.actionableSnagCount, 1);
  assert.equal(row.overdueSnagCount, 0);
});

check('overdue: actionable snag with no dueDate at all is never overdue', () => {
  const snags = { 1: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: null }] };
  const [row] = computeContractorWorkspaceRows([projectA], {}, snags, actor, NOW);
  assert.equal(row.actionableSnagCount, 1);
  assert.equal(row.overdueSnagCount, 0);
});

check('overdue: a CLOSED snag with a past dueDate is not actionable and not overdue (canonical workflow excludes it)', () => {
  const snags = { 1: [{ status: 'CLOSED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: '2020-01-01' }] };
  const [row] = computeContractorWorkspaceRows([projectA], {}, snags, actor, NOW);
  assert.equal(row.actionableSnagCount, 0);
  assert.equal(row.overdueSnagCount, 0);
});

check('overdue: a past-due snag assigned to a different contractor does not count for this actor', () => {
  const snags = { 1: [{ status: 'ASSIGNED', assigneeId: 'someone-else', publicationState: 'PUBLISHED', dueDate: '2020-01-01' }] };
  const [row] = computeContractorWorkspaceRows([projectA], {}, snags, actor, NOW);
  assert.equal(row.actionableSnagCount, 0);
  assert.equal(row.overdueSnagCount, 0);
});

// ── sort: overdue observations now outrank everything else ─────────────

check('sort: a project with an overdue actionable snag sorts before a project with a missing report', () => {
  // B has no report at all (missing) but no snags; A has a recent report but one overdue snag.
  const reports = { 2: [] };
  const snagsA = { 1: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: '2020-01-01' }] };
  const reportsA = { 1: [{ projectId: 1, reportingDate: '2026-07-21' }] };
  const rows = computeContractorWorkspaceRows([projectB, projectA], { ...reports, ...reportsA }, snagsA, actor, NOW);
  assert.equal(rows[0].project.id, 1);
  assert.equal(rows[1].project.id, 2);
});

// ── buildContractorWorkspaceSummary ──────────────────────────────────────

check('summary: empty rows produce a valid all-zero summary', () => {
  assert.deepEqual(buildContractorWorkspaceSummary([]), {
    projectCount: 0, reportsNeedingActionCount: 0, openObservationsCount: 0, overdueObservationsCount: 0,
  });
});

check('summary: counts only the rows supplied to it (already-scoped input)', () => {
  const reports = { 1: [{ projectId: 1, reportingDate: '2026-07-21' }] };
  const snags = { 1: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: '2020-01-01' }] };
  const rows = computeContractorWorkspaceRows([projectA], reports, snags, actor, NOW);
  const summary = buildContractorWorkspaceSummary(rows);
  assert.equal(summary.projectCount, 1);
  assert.equal(summary.reportsNeedingActionCount, 0);
  assert.equal(summary.openObservationsCount, 1);
  assert.equal(summary.overdueObservationsCount, 1);
});

check('summary: reports-needing-action reflects the canonical missingReport flag across projects', () => {
  const reports = { 2: [{ projectId: 2, reportingDate: '2026-07-21' }] }; // A has no report -> missing
  const rows = computeContractorWorkspaceRows([projectA, projectB], reports, {}, actor, NOW);
  const summary = buildContractorWorkspaceSummary(rows);
  assert.equal(summary.projectCount, 2);
  assert.equal(summary.reportsNeedingActionCount, 1);
});

check('summary: assigned projects with no actionable work at all -> every metric is zero', () => {
  const reports = {
    1: [{ projectId: 1, reportingDate: '2026-07-21' }],
    2: [{ projectId: 2, reportingDate: '2026-07-21' }],
    3: [{ projectId: 3, reportingDate: '2026-07-21' }],
  };
  const rows = computeContractorWorkspaceRows([projectA, projectB, projectC], reports, {}, actor, NOW);
  const summary = buildContractorWorkspaceSummary(rows);
  assert.deepEqual(summary, { projectCount: 3, reportsNeedingActionCount: 0, openObservationsCount: 0, overdueObservationsCount: 0 });
});

// ── scoping: an unassigned project's data can never leak in ─────────────

check('scoping: a project absent from the `projects` array never appears in rows or summary, even if its reports/snags are present in the raw maps', () => {
  const unassignedProjectId = 999;
  const reports = {
    1: [{ projectId: 1, reportingDate: '2026-07-21' }],
    [unassignedProjectId]: [{ projectId: unassignedProjectId, reportingDate: '2020-01-01' }], // would be "missing" if it were ever included
  };
  const snags = {
    [unassignedProjectId]: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: '2020-01-01' }],
  };
  // `projects` is the already-scoped assigned_projects list — it does NOT include unassignedProjectId,
  // simulating exactly what ContractorSelect.jsx passes in after its own assigned_projects filter.
  const rows = computeContractorWorkspaceRows([projectA], reports, snags, actor, NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].project.id, 1);
  assert.equal(rows.some(r => r.project.id === unassignedProjectId), false);

  const summary = buildContractorWorkspaceSummary(rows);
  assert.equal(summary.projectCount, 1);
  // The unassigned project's overdue report/snag must not be counted anywhere.
  assert.equal(summary.reportsNeedingActionCount, 0);
  assert.equal(summary.openObservationsCount, 0);
  assert.equal(summary.overdueObservationsCount, 0);
});

// ── filterContractorWorkspaceRows ────────────────────────────────────────

check('filter: ALL (Projects) returns every supplied row unchanged', () => {
  const reports = { 1: [{ projectId: 1, reportingDate: '2026-07-21' }] };
  const rows = computeContractorWorkspaceRows([projectA, projectB], reports, {}, actor, NOW);
  assert.deepEqual(filterContractorWorkspaceRows(rows, CONTRACTOR_WORKSPACE_FILTERS.ALL), rows);
});

check('filter: REPORTS returns only rows whose report needs action', () => {
  const reports = { 2: [{ projectId: 2, reportingDate: '2026-07-21' }] }; // A missing, B not
  const rows = computeContractorWorkspaceRows([projectA, projectB], reports, {}, actor, NOW);
  const filtered = filterContractorWorkspaceRows(rows, CONTRACTOR_WORKSPACE_FILTERS.REPORTS);
  assert.deepEqual(filtered.map(r => r.project.id), [1]);
});

check('filter: OBSERVATIONS returns only rows with at least one actionable observation', () => {
  const reports = { 1: [{ projectId: 1, reportingDate: '2026-07-21' }], 2: [{ projectId: 2, reportingDate: '2026-07-21' }] };
  const snags = { 2: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED' }] };
  const rows = computeContractorWorkspaceRows([projectA, projectB], reports, snags, actor, NOW);
  const filtered = filterContractorWorkspaceRows(rows, CONTRACTOR_WORKSPACE_FILTERS.OBSERVATIONS);
  assert.deepEqual(filtered.map(r => r.project.id), [2]);
});

check('filter: OVERDUE returns only rows with at least one overdue actionable observation', () => {
  const reports = { 1: [{ projectId: 1, reportingDate: '2026-07-21' }], 2: [{ projectId: 2, reportingDate: '2026-07-21' }] };
  const snags = {
    1: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: '2026-12-01' }], // actionable, not overdue
    2: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: '2020-01-01' }], // overdue
  };
  const rows = computeContractorWorkspaceRows([projectA, projectB], reports, snags, actor, NOW);
  const filtered = filterContractorWorkspaceRows(rows, CONTRACTOR_WORKSPACE_FILTERS.OVERDUE);
  assert.deepEqual(filtered.map(r => r.project.id), [2]);
});

check('filter: filtering never mutates rows or changes summary counts computed from them', () => {
  const reports = { 1: [{ projectId: 1, reportingDate: '2026-07-21' }] };
  const snags = { 1: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: '2020-01-01' }] };
  const rows = computeContractorWorkspaceRows([projectA, projectB], reports, snags, actor, NOW);
  const summaryBefore = buildContractorWorkspaceSummary(rows);
  filterContractorWorkspaceRows(rows, CONTRACTOR_WORKSPACE_FILTERS.OVERDUE);
  const summaryAfter = buildContractorWorkspaceSummary(rows);
  assert.deepEqual(summaryBefore, summaryAfter);
});

check('filter: empty rows are safe for every filter value', () => {
  for (const filter of Object.values(CONTRACTOR_WORKSPACE_FILTERS)) {
    assert.deepEqual(filterContractorWorkspaceRows([], filter), []);
  }
});

check('filter: preserves the existing attention-first ordering of the rows it returns', () => {
  const snags = {
    1: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: '2020-01-01' }],
    2: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: '2020-06-01' }],
  };
  const reports = { 1: [{ projectId: 1, reportingDate: '2026-07-21' }], 2: [{ projectId: 2, reportingDate: '2026-07-21' }] };
  const rows = computeContractorWorkspaceRows([projectB, projectA], reports, snags, actor, NOW); // both overdue; A opens sooner
  const filtered = filterContractorWorkspaceRows(rows, CONTRACTOR_WORKSPACE_FILTERS.OVERDUE);
  assert.deepEqual(filtered.map(r => r.project.id), rows.map(r => r.project.id));
});

// ── rowNeedsAttention / Needs Attention vs Up to Date classification ────

check('rowNeedsAttention: true when the report is missing', () => {
  const [row] = computeContractorWorkspaceRows([projectA], {}, {}, actor, NOW);
  assert.equal(rowNeedsAttention(row), true);
});

check('rowNeedsAttention: true when there is at least one actionable observation, even with a current report', () => {
  const reports = { 1: [{ projectId: 1, reportingDate: '2026-07-21' }] };
  const snags = { 1: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED' }] };
  const [row] = computeContractorWorkspaceRows([projectA], reports, snags, actor, NOW);
  assert.equal(rowNeedsAttention(row), true);
});

check('rowNeedsAttention: false for a fully up-to-date project (current report, zero actionable observations)', () => {
  const reports = { 1: [{ projectId: 1, reportingDate: '2026-07-21' }] };
  const [row] = computeContractorWorkspaceRows([projectA], reports, {}, actor, NOW);
  assert.equal(rowNeedsAttention(row), false);
});

// ── scoping (strengthened): filtering can never surface an unassigned project ─

check('scoping: applying any summary filter to already-scoped rows still cannot surface an unassigned project', () => {
  const unassignedProjectId = 999;
  const reports = {
    1: [{ projectId: 1, reportingDate: '2020-01-01' }],
    [unassignedProjectId]: [{ projectId: unassignedProjectId, reportingDate: '2020-01-01' }],
  };
  const snags = {
    [unassignedProjectId]: [{ status: 'ASSIGNED', assigneeId: 'contractor-1', publicationState: 'PUBLISHED', dueDate: '2020-01-01' }],
  };
  const rows = computeContractorWorkspaceRows([projectA], reports, snags, actor, NOW); // `projects` excludes 999
  for (const filter of Object.values(CONTRACTOR_WORKSPACE_FILTERS)) {
    const filtered = filterContractorWorkspaceRows(rows, filter);
    assert.equal(filtered.some(r => r.project.id === unassignedProjectId), false);
  }
});

// ── Admin selector: resolving a specific contractor's scope ─────────────
// The real composition path — projects.filter(assignedProjects) followed by
// computeContractorWorkspaceRows/buildContractorWorkspaceSummary — is the
// exact same pipeline ContractorSelect.jsx uses for both a real Contractor
// session and an Admin-selected contractor. Exercising it directly (not a
// mock) proves two contractors' data can never mix.

check('admin selector: Contractor A (assigned projects 1,2) resolves to rows/summary that never include Contractor B\'s project 3', () => {
  const contractorA = { id: 'contractor-a', assignedProjects: [1, 2] };
  const allProjects = [projectA, projectB, { id: 3, targetOpeningDate: '2026-10-01' }];
  const reports = {
    1: [{ projectId: 1, reportingDate: '2026-07-21' }],
    3: [{ projectId: 3, reportingDate: '2020-01-01' }], // Contractor B's project — very overdue
  };
  const snags = {
    3: [{ status: 'ASSIGNED', assigneeId: 'contractor-b', publicationState: 'PUBLISHED', dueDate: '2020-01-01' }],
  };

  const scopedProjects = allProjects.filter(p => contractorA.assignedProjects.includes(Number(p.id)));
  const rows = computeContractorWorkspaceRows(scopedProjects, reports, snags, { id: contractorA.id, role: 'Contractor' }, NOW);
  assert.deepEqual(rows.map(r => r.project.id).sort(), [1, 2]);
  assert.equal(rows.some(r => r.project.id === 3), false);

  const summary = buildContractorWorkspaceSummary(rows);
  assert.equal(summary.projectCount, 2);
  assert.equal(summary.overdueObservationsCount, 0); // project 3's overdue snag must not leak into A's summary
});

check('admin selector: selecting Contractor B produces only project 3, with its own overdue work correctly counted', () => {
  const contractorB = { id: 'contractor-b', assignedProjects: [3] };
  const allProjects = [projectA, projectB, { id: 3, targetOpeningDate: '2026-10-01' }];
  const reports = { 3: [{ projectId: 3, reportingDate: '2020-01-01' }] };
  const snags = { 3: [{ status: 'ASSIGNED', assigneeId: 'contractor-b', publicationState: 'PUBLISHED', dueDate: '2020-01-01' }] };

  const scopedProjects = allProjects.filter(p => contractorB.assignedProjects.includes(Number(p.id)));
  const rows = computeContractorWorkspaceRows(scopedProjects, reports, snags, { id: contractorB.id, role: 'Contractor' }, NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].project.id, 3);

  const summary = buildContractorWorkspaceSummary(rows);
  assert.equal(summary.projectCount, 1);
  assert.equal(summary.overdueObservationsCount, 1);
});

check('admin selector: a contractor with an empty assignedProjects array resolves to a valid empty workspace, not a fallback to all projects', () => {
  const contractorC = { id: 'contractor-c', assignedProjects: [] };
  const allProjects = [projectA, projectB];
  const scopedProjects = allProjects.filter(p => contractorC.assignedProjects.includes(Number(p.id)));
  assert.equal(scopedProjects.length, 0);

  const rows = computeContractorWorkspaceRows(scopedProjects, {}, {}, { id: contractorC.id, role: 'Contractor' }, NOW);
  assert.deepEqual(rows, []);
  assert.deepEqual(buildContractorWorkspaceSummary(rows), {
    projectCount: 0, reportsNeedingActionCount: 0, openObservationsCount: 0, overdueObservationsCount: 0,
  });
});

// Phase 3D.1 — a fresh CONTRACTOR_MANAGED project (no schedule commitment
// yet) must never show "missing report" just because it has zero reports;
// AUTO_GENERATED (and projects without scheduleOwnershipMode at all, the
// pre-3D.1 legacy shape) must be completely unaffected.
const projectD_contractorManaged = { id: 4, targetOpeningDate: null, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' };
const projectE_autoGenerated     = { id: 5, targetOpeningDate: null, scheduleOwnershipMode: 'AUTO_GENERATED' };

check('Phase 3D.1: CONTRACTOR_MANAGED, no schedule commitment, zero reports -> missingReport false (not fabricated)', () => {
  const [row] = computeContractorWorkspaceRows([projectD_contractorManaged], {}, {}, actor, NOW);
  assert.equal(row.missingReport, false);
  assert.equal(row.reportDueState, 'NOT_YET_DUE');
});

check('Phase 3D.1: CONTRACTOR_MANAGED row with no missing report and no snags does not trigger rowNeedsAttention', () => {
  const [row] = computeContractorWorkspaceRows([projectD_contractorManaged], {}, {}, actor, NOW);
  assert.equal(rowNeedsAttention(row), false);
});

check('Phase 3D.1: AUTO_GENERATED, zero reports -> missingReport still true (unchanged legacy behavior)', () => {
  const [row] = computeContractorWorkspaceRows([projectE_autoGenerated], {}, {}, actor, NOW);
  assert.equal(row.missingReport, true);
  assert.equal(row.reportDueState, 'OVERDUE');
});

check('Phase 3D.1: project with no scheduleOwnershipMode field at all -> unchanged legacy behavior (missing = true)', () => {
  const [row] = computeContractorWorkspaceRows([projectA], {}, {}, actor, NOW);
  assert.equal(row.missingReport, true);
  assert.equal(row.reportDueState, 'OVERDUE');
});

// Live approved-commitment projection (Phase 3D.1 completion): once a real
// scheduleCommitmentProjection map is supplied (loadScheduleCommitmentProjection.js
// output), an Approved Baseline must actually flip commitmentState to
// COMMITTED and drive real report-due semantics — not stay conservatively
// NOT_YET_COMMITTED forever just because the map exists.
check('live projection: APPROVED entry -> commitmentState COMMITTED, reportDueState reflects real obligation start', () => {
  const projection = new Map([
    ['4', { lifecycleStatus: 'APPROVED', commitmentState: 'COMMITTED', approvedVersionId: 'v1', approvedAt: '2026-07-01T00:00:00Z', earliestCommittedPlannedStart: '2026-07-05', baselineRevisionNumber: 1 }],
  ]);
  const [row] = computeContractorWorkspaceRows([projectD_contractorManaged], {}, {}, actor, new Date('2026-07-06T00:00:00Z'), projection);
  assert.equal(row.reportDueState, 'DUE');
  assert.equal(row.missingReport, false);
});

check('live projection: APPROVED entry, elapsed >7 days with no report -> OVERDUE / Needs Attention', () => {
  const projection = new Map([
    ['4', { lifecycleStatus: 'APPROVED', commitmentState: 'COMMITTED', approvedVersionId: 'v1', approvedAt: '2026-07-01T00:00:00Z', earliestCommittedPlannedStart: '2026-07-05', baselineRevisionNumber: 1 }],
  ]);
  const [row] = computeContractorWorkspaceRows([projectD_contractorManaged], {}, {}, actor, new Date('2026-07-14T00:00:00Z'), projection);
  assert.equal(row.reportDueState, 'OVERDUE');
  assert.equal(row.missingReport, true);
  assert.equal(rowNeedsAttention(row), true);
});

check('live projection: PENDING_REVIEW entry -> still NOT_YET_DUE (PROPOSED is not a commitment)', () => {
  const projection = new Map([
    ['4', { lifecycleStatus: 'PENDING_REVIEW', commitmentState: 'PROPOSED', approvedVersionId: null, approvedAt: null, earliestCommittedPlannedStart: null, baselineRevisionNumber: null }],
  ]);
  const [row] = computeContractorWorkspaceRows([projectD_contractorManaged], {}, {}, actor, NOW, projection);
  assert.equal(row.reportDueState, 'NOT_YET_DUE');
  assert.equal(row.missingReport, false);
});

check('live projection: missing entry for this project id -> falls back to conservative ownership-only default', () => {
  const projection = new Map([['999', { lifecycleStatus: 'APPROVED', commitmentState: 'COMMITTED' }]]); // some other project only
  const [row] = computeContractorWorkspaceRows([projectD_contractorManaged], {}, {}, actor, NOW, projection);
  assert.equal(row.reportDueState, 'NOT_YET_DUE');
  // Projection Completeness Hardening: the missing entry must not be
  // presented as a confirmed/proven no-version lookup — the row's own
  // availability field stays null (never "AVAILABLE"), even though the
  // engine's own numeric fallback (NOT_YET_DUE) happens to coincide with
  // what a genuinely confirmed no-version project would also show.
  assert.equal(row.scheduleProjectionAvailability, null);
});

check('live projection: explicit UNAVAILABLE entry never fabricates COMMITTED/OVERDUE from missing data', () => {
  const projection = new Map([['4', {
    projectionAvailability: 'UNAVAILABLE', lifecycleStatus: null, commitmentState: null,
    approvedVersionId: 'v-unknown', approvedAt: null, earliestCommittedPlannedStart: null, baselineRevisionNumber: null,
  }]]);
  const [row] = computeContractorWorkspaceRows([projectD_contractorManaged], {}, {}, actor, NOW, projection);
  assert.equal(row.scheduleProjectionAvailability, 'UNAVAILABLE');
  assert.equal(row.reportDueState, 'NOT_YET_DUE');
  assert.equal(row.missingReport, false);
});

check('live projection: AUTO_GENERATED project is unaffected even if a (bogus) projection entry exists for it', () => {
  const projection = new Map([['5', { lifecycleStatus: 'APPROVED', commitmentState: 'COMMITTED' }]]);
  const [row] = computeContractorWorkspaceRows([projectE_autoGenerated], {}, {}, actor, NOW, projection);
  assert.equal(row.missingReport, true); // legacy branch, ignores the projection entirely
  assert.equal(row.reportDueState, 'OVERDUE');
});

console.log(`\n-- RESULT: ${passed} passed, 0 failed --`);
