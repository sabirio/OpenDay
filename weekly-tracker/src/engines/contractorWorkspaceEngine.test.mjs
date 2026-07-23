import assert from 'node:assert/strict';
import { buildContractorWorkspaceSummary, computeContractorWorkspaceRows } from './contractorWorkspaceEngine.js';

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

console.log(`\n-- RESULT: ${passed} passed, 0 failed --`);
