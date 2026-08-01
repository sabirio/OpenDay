// contractorScheduleDraftModel.test.mjs — Simplification Phase 3B.
// Pure state-transition tests for the local Contractor Draft buffer. No
// Supabase, no React — saveContractorScheduleDraft.js (the I/O half) is
// exercised separately via the DB certification script.

import {
  createEmptyDraftState,
  stageTaskDates,
  discardTaskChange,
  discardAllChanges,
  isDirty,
  changedTaskCount,
  toChangesArray,
  reconcileAfterSave,
} from './contractorScheduleDraftModel.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\ncreateEmptyDraftState / isDirty / changedTaskCount');
{
  const s = createEmptyDraftState();
  check('empty state is not dirty', isDirty(s) === false);
  check('empty state has zero changed tasks', changedTaskCount(s) === 0);
  check('empty state has an empty changes array', toChangesArray(s).length === 0);
}

console.log('\nstageTaskDates');
{
  let s = createEmptyDraftState();
  s = stageTaskDates(s, 'wp.a', '2026-09-01', '2026-09-05');
  check('staging one task makes state dirty', isDirty(s) === true);
  check('changedTaskCount reflects one staged task', changedTaskCount(s) === 1);
  check('toChangesArray contains the staged WP with its dates', toChangesArray(s).some(
    c => c.wpId === 'wp.a' && c.plannedStart === '2026-09-01' && c.plannedFinish === '2026-09-05'));

  s = stageTaskDates(s, 'wp.b', '2026-10-01', '2026-10-03');
  check('staging a second task does not remove the first', changedTaskCount(s) === 2);

  s = stageTaskDates(s, 'wp.a', '2026-09-02', '2026-09-06');
  check('re-staging the same WP replaces its change, does not add a second entry', changedTaskCount(s) === 2);
  check('re-staging updates the dates', toChangesArray(s).find(c => c.wpId === 'wp.a').plannedStart === '2026-09-02');

  check('stageTaskDates requires a wpId', (() => {
    try { stageTaskDates(s, null, '2026-01-01', '2026-01-02'); return false; } catch { return true; }
  })());
}

console.log('\ndiscardTaskChange');
{
  let s = createEmptyDraftState();
  s = stageTaskDates(s, 'wp.a', '2026-09-01', '2026-09-05');
  s = stageTaskDates(s, 'wp.b', '2026-10-01', '2026-10-03');

  const s2 = discardTaskChange(s, 'wp.a');
  check('discarding one task removes only that task', changedTaskCount(s2) === 1 && toChangesArray(s2)[0].wpId === 'wp.b');
  check('original state is untouched (pure function)', changedTaskCount(s) === 2);

  const s3 = discardTaskChange(s, 'wp.does-not-exist');
  check('discarding a WP with no staged change is a safe no-op', changedTaskCount(s3) === 2);
}

console.log('\ndiscardAllChanges');
{
  let s = createEmptyDraftState();
  s = stageTaskDates(s, 'wp.a', '2026-09-01', '2026-09-05');
  s = stageTaskDates(s, 'wp.b', '2026-10-01', '2026-10-03');

  const cleared = discardAllChanges();
  check('discardAllChanges returns a fresh empty state', isDirty(cleared) === false && changedTaskCount(cleared) === 0);
  check('discardAllChanges does not mutate the state it was conceptually clearing (no argument taken, no shared reference)',
    changedTaskCount(s) === 2);
}

console.log('\nreconcileAfterSave');
{
  let s = createEmptyDraftState();
  s = stageTaskDates(s, 'wp.a', '2026-09-01', '2026-09-05');
  s = stageTaskDates(s, 'wp.b', '2026-10-01', '2026-10-03');
  s = stageTaskDates(s, 'wp.c', '2026-11-01', '2026-11-03');

  const afterFullSave = reconcileAfterSave(s, ['wp.a', 'wp.b', 'wp.c']);
  check('reconcile after a full save clears the whole buffer', isDirty(afterFullSave) === false);

  const afterPartialSave = reconcileAfterSave(s, ['wp.a']);
  check('reconcile after a partial save keeps the un-saved changes staged', changedTaskCount(afterPartialSave) === 2);
  check('reconcile removes exactly the saved WP, not others', !toChangesArray(afterPartialSave).some(c => c.wpId === 'wp.a'));
  check('original state is untouched (pure function)', changedTaskCount(s) === 3);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
