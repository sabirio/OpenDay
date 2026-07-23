import assert from 'node:assert/strict';
import { computeContractorWorkspaceRows } from './contractorWorkspaceEngine.js';

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

console.log(`\n-- RESULT: ${passed} passed, 0 failed --`);
