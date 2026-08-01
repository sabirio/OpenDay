// scheduleCommitmentBatchProjection.test.mjs — Simplification Phase 3D.1
// (live approved-commitment projection).

import { buildScheduleCommitmentProjection } from './scheduleCommitmentBatchProjection.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

function version({ id, projectId, submissionNumber, status, reviewedAt = null, baselineRevisionNumber = null }) {
  return { id, projectId, submissionNumber, status, reviewedAt, baselineRevisionNumber };
}

console.log('\nAUTO_GENERATED -> always COMMITTED, never touches versions/tasks');
{
  const projects = [{ id: 1, scheduleOwnershipMode: 'AUTO_GENERATED' }];
  // Deliberately include a version row for project 1 to prove it's ignored.
  const versions = [version({ id: 'v1', projectId: 1, submissionNumber: 1, status: 'PENDING_REVIEW' })];
  const projection = buildScheduleCommitmentProjection(projects, versions, []);
  const facts = projection.get('1');
  check('commitmentState is COMMITTED', facts.commitmentState === 'COMMITTED');
  check('lifecycleStatus is null (never consulted)', facts.lifecycleStatus === null);
  check('approvedVersionId is null', facts.approvedVersionId === null);
}

console.log('\nCONTRACTOR_MANAGED, no version at all -> DRAFT -> NOT_YET_COMMITTED');
{
  const projects = [{ id: 2, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' }];
  const projection = buildScheduleCommitmentProjection(projects, [], []);
  const facts = projection.get('2');
  check('lifecycleStatus is DRAFT', facts.lifecycleStatus === 'DRAFT');
  check('commitmentState is NOT_YET_COMMITTED', facts.commitmentState === 'NOT_YET_COMMITTED');
  check('approvedAt is null', facts.approvedAt === null);
  check('earliestCommittedPlannedStart is null', facts.earliestCommittedPlannedStart === null);
}

console.log('\nCONTRACTOR_MANAGED, latest submission PENDING_REVIEW -> PROPOSED');
{
  const projects = [{ id: 3, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' }];
  const versions = [version({ id: 'v3', projectId: 3, submissionNumber: 1, status: 'PENDING_REVIEW' })];
  const projection = buildScheduleCommitmentProjection(projects, versions, []);
  const facts = projection.get('3');
  check('lifecycleStatus is PENDING_REVIEW', facts.lifecycleStatus === 'PENDING_REVIEW');
  check('commitmentState is PROPOSED', facts.commitmentState === 'PROPOSED');
}

console.log('\nCONTRACTOR_MANAGED, latest submission CHANGES_REQUESTED -> NOT_YET_COMMITTED');
{
  const projects = [{ id: 4, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' }];
  const versions = [version({ id: 'v4', projectId: 4, submissionNumber: 1, status: 'CHANGES_REQUESTED' })];
  const projection = buildScheduleCommitmentProjection(projects, versions, []);
  const facts = projection.get('4');
  check('lifecycleStatus is CHANGES_REQUESTED', facts.lifecycleStatus === 'CHANGES_REQUESTED');
  check('commitmentState is NOT_YET_COMMITTED', facts.commitmentState === 'NOT_YET_COMMITTED');
}

console.log('\nCONTRACTOR_MANAGED, latest submission APPROVED -> COMMITTED with full immutable facts');
{
  const projects = [{ id: 5, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' }];
  const versions = [version({ id: 'v5', projectId: 5, submissionNumber: 1, status: 'APPROVED', reviewedAt: '2027-02-01T00:00:00Z', baselineRevisionNumber: 1 })];
  const versionTasks = [
    { versionId: 'v5', plannedStart: '2027-02-10' },
    { versionId: 'v5', plannedStart: '2027-01-20' },
  ];
  const projection = buildScheduleCommitmentProjection(projects, versions, versionTasks);
  const facts = projection.get('5');
  check('lifecycleStatus is APPROVED', facts.lifecycleStatus === 'APPROVED');
  check('commitmentState is COMMITTED', facts.commitmentState === 'COMMITTED');
  check('approvedVersionId is the approved version', facts.approvedVersionId === 'v5');
  check('approvedAt is the version\'s reviewedAt', facts.approvedAt === '2027-02-01T00:00:00Z');
  check('earliestCommittedPlannedStart is the min planned_start of THAT version\'s tasks', facts.earliestCommittedPlannedStart === '2027-01-20');
  check('baselineRevisionNumber is exposed', facts.baselineRevisionNumber === 1);
}

console.log('\nCONTRACTOR_MANAGED APPROVED, no matching task rows fetched -> earliestCommittedPlannedStart null, not a crash');
{
  const projects = [{ id: 6, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' }];
  const versions = [version({ id: 'v6', projectId: 6, submissionNumber: 1, status: 'APPROVED', reviewedAt: '2027-03-01T00:00:00Z' })];
  const projection = buildScheduleCommitmentProjection(projects, versions, []);
  const facts = projection.get('6');
  check('commitmentState still COMMITTED from approvedAt alone', facts.commitmentState === 'COMMITTED');
  check('earliestCommittedPlannedStart is null', facts.earliestCommittedPlannedStart === null);
}

console.log('\nMulti-project batch: no cross-project version/task mixing');
{
  const projects = [
    { id: 100, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' },
    { id: 200, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' },
  ];
  const versions = [
    version({ id: 'vA', projectId: 100, submissionNumber: 1, status: 'APPROVED', reviewedAt: '2027-01-01T00:00:00Z' }),
    version({ id: 'vB', projectId: 200, submissionNumber: 1, status: 'PENDING_REVIEW' }),
  ];
  const versionTasks = [
    { versionId: 'vA', plannedStart: '2027-01-05' },
    { versionId: 'vB', plannedStart: '1999-01-01' }, // a PENDING (not approved) version's tasks must never leak in as project 100's earliest date
  ];
  const projection = buildScheduleCommitmentProjection(projects, versions, versionTasks);
  const facts100 = projection.get('100');
  const facts200 = projection.get('200');
  check('project 100 commitmentState is COMMITTED (its own approved version)', facts100.commitmentState === 'COMMITTED');
  check('project 100 earliestCommittedPlannedStart comes from vA only, not vB\'s implausible 1999 date', facts100.earliestCommittedPlannedStart === '2027-01-05');
  check('project 200 commitmentState is PROPOSED (its own pending version)', facts200.commitmentState === 'PROPOSED');
  check('project 200 approvedVersionId is null (no approved version for this project)', facts200.approvedVersionId === null);
}

console.log('\nEmpty/defensive inputs');
{
  const projection = buildScheduleCommitmentProjection([], [], []);
  check('empty projects -> empty map', projection.size === 0);

  const noArgsProjection = buildScheduleCommitmentProjection();
  check('no arguments at all -> empty map, not a crash', noArgsProjection.size === 0);

  const missingOwnershipMode = buildScheduleCommitmentProjection([{ id: 7 }], [], []);
  check('project with no scheduleOwnershipMode field -> safe COMMITTED default (matches AUTO_GENERATED fallback)',
    missingOwnershipMode.get('7').commitmentState === 'COMMITTED');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
