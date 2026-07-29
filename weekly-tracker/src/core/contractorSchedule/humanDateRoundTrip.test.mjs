// humanDateRoundTrip.test.mjs — Simplification Phase 3B.1.
//
// Proves the FULL pipeline (UI -> Draft -> RPC-shape -> DB -> reload -> UI)
// preserves the human-visible Start/Finish exactly, with no +1/-1 drift,
// across every interaction (move/resize-left/resize-right/manual entry)
// and across repeated edit/save cycles. Composes the real pure functions
// from ganttLayout.js (the drag math + the human-date adapter) and
// contractorScheduleDraftModel.js (the draft buffer) together — the same
// functions the real hook/component use — plus a JS mirror of
// save_contractor_schedule_draft's one canonicalization expression
// (planned_end = plannedFinish + 1) so the whole chain can be exercised
// without a live database. The DB half of this same proof (the RPC really
// does this, not just this mirror) is certifyContractorScheduleDraft.mjs.

import { computeDragEditDates, pixelsToDays, toHumanFinishInclusive, toInternalEndBoundary } from '../../engines/ganttLayout.js';
import { createEmptyDraftState, stageTaskDates, toChangesArray } from './contractorScheduleDraftModel.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

function isoDate(d) { return d.toISOString().split('T')[0]; }

// Mirrors GanttChart.jsx's callback boundary: a completed drag/resize
// always emits internal-exclusive {plannedStart, plannedEnd}. Mirrors
// useContractorScheduleDraft.js's stageTaskDates: converts to the buffer's
// human-inclusive plannedFinish before staging.
function stageFromDragResult(state, wpId, { earlyStart, earlyFinish }) {
  const plannedFinish = toHumanFinishInclusive(earlyFinish);
  return stageTaskDates(state, wpId, isoDate(earlyStart), isoDate(plannedFinish));
}

// Mirrors save_contractor_schedule_draft's ONE canonicalization expression
// (047_contractor_schedule_human_date_semantics.sql): planned_end =
// plannedFinish + 1. Verified against the real RPC by
// certifyContractorScheduleDraft.mjs; this is a same-formula JS mirror so
// the full pipeline can be tested without a live database.
function simulateRpcPersist(change) {
  const plannedStart = new Date(change.plannedStart);
  const plannedEnd = toInternalEndBoundary(new Date(change.plannedFinish));
  return { earlyStart: plannedStart, earlyFinish: plannedEnd };
}

console.log('\n1. Human Start Aug 1 / Finish Aug 1 round-trips as one day');
{
  const state = stageTaskDates(createEmptyDraftState(), 'wp.a', '2026-08-01', '2026-08-01');
  const [change] = toChangesArray(state);
  const persisted = simulateRpcPersist(change);
  check('persisted planned_end is Aug 2 (internal exclusive boundary, 1 day span)',
    isoDate(persisted.earlyFinish) === '2026-08-02');
  const reDisplayedFinish = toHumanFinishInclusive(persisted.earlyFinish);
  check('reloaded and re-displayed human Finish is exactly Aug 1 again', isoDate(reDisplayedFinish) === '2026-08-01');
}

console.log('\n2. Human Aug 1 / Aug 3 round-trips as three days');
{
  const state = stageTaskDates(createEmptyDraftState(), 'wp.a', '2026-08-01', '2026-08-03');
  const [change] = toChangesArray(state);
  const persisted = simulateRpcPersist(change);
  check('persisted planned_end is Aug 4 (3-day span)', isoDate(persisted.earlyFinish) === '2026-08-04');
  check('persisted duration_days is 3', (persisted.earlyFinish - persisted.earlyStart) / 86400000 === 3);
  check('reloaded and re-displayed human Finish is exactly Aug 3 again',
    isoDate(toHumanFinishInclusive(persisted.earlyFinish)) === '2026-08-03');
}

console.log('\n3. Whole-bar move preserves visible duration');
{
  const origStart = new Date('2026-08-10');
  const origFinish = new Date('2026-08-14'); // internal exclusive: 4-day span
  const dxDays = pixelsToDays(120, 30); // some arbitrary drag distance
  const moved = computeDragEditDates(origStart, origFinish, 'move', dxDays);
  check('move preserves the internal-exclusive span exactly', moved.durationDays === 4);

  const state = stageFromDragResult(createEmptyDraftState(), 'wp.a', moved);
  const [change] = toChangesArray(state);
  const humanSpanDays = (new Date(change.plannedFinish) - new Date(change.plannedStart)) / 86400000 + 1; // inclusive count
  check('staged human-inclusive span is still 4 calendar days after a move', humanSpanDays === 4);
}

console.log('\n4. Resize left keeps visible Finish fixed');
{
  const origStart = new Date('2026-08-10');
  const origFinish = new Date('2026-08-15');
  const resized = computeDragEditDates(origStart, origFinish, 'left', -3);
  check('resize left leaves the internal-exclusive earlyFinish untouched', resized.earlyFinish.getTime() === origFinish.getTime());

  const state = stageFromDragResult(createEmptyDraftState(), 'wp.a', resized);
  const [change] = toChangesArray(state);
  check('staged human Finish is still Aug 14 (the same visible last day of work as before the resize)',
    change.plannedFinish === isoDate(toHumanFinishInclusive(origFinish)));
}

console.log('\n5. Resize right keeps visible Start fixed');
{
  const origStart = new Date('2026-08-10');
  const origFinish = new Date('2026-08-15');
  const resized = computeDragEditDates(origStart, origFinish, 'right', 3);
  check('resize right leaves earlyStart untouched', resized.earlyStart.getTime() === origStart.getTime());

  const state = stageFromDragResult(createEmptyDraftState(), 'wp.a', resized);
  const [change] = toChangesArray(state);
  check('staged human Start is unchanged by a right-resize', change.plannedStart === isoDate(origStart));
}

console.log('\n6. Manual input and drag produce the same canonical persisted result');
{
  // Drag path: a bar visually spanning Aug 1 (inclusive) through Aug 3
  // (inclusive) is internally earlyStart=Aug1, earlyFinish=Aug4 (exclusive).
  const dragResult = { earlyStart: new Date('2026-08-01'), earlyFinish: new Date('2026-08-04') };
  const stateFromDrag = stageFromDragResult(createEmptyDraftState(), 'wp.a', dragResult);

  // Manual-entry path: WPTooltip converts its own human-inclusive Finish
  // input back to the same internal-exclusive shape before calling the
  // identical onManualDateChange/stageTaskDates path (GanttChart.jsx's own
  // commitDates()) — so a human typing Start=Aug1, Finish=Aug3 produces the
  // identical drag-shaped {plannedStart, plannedEnd} before staging.
  const manualEnd = toInternalEndBoundary(new Date('2026-08-03'));
  const manualDragShaped = { earlyStart: new Date('2026-08-01'), earlyFinish: manualEnd };
  const stateFromManual = stageFromDragResult(createEmptyDraftState(), 'wp.a', manualDragShaped);

  check('drag and manual entry of the same visible range stage byte-identical draft state',
    JSON.stringify(stateFromDrag) === JSON.stringify(stateFromManual));
}

console.log('\n7. Save/reload produces identical user-visible Start/Finish');
{
  const humanStart = '2026-09-05';
  const humanFinish = '2026-09-09';
  const state = stageTaskDates(createEmptyDraftState(), 'wp.a', humanStart, humanFinish);
  const [change] = toChangesArray(state);

  // "Save" (RPC canonicalization) then "reload" (fetch the persisted row
  // and map it the same way ganttService.js's fromDBTask does).
  const persisted = simulateRpcPersist(change);
  const reloadedTask = { earlyStart: persisted.earlyStart, earlyFinish: persisted.earlyFinish };

  check('reloaded Start matches exactly what the user entered',
    isoDate(reloadedTask.earlyStart) === humanStart);
  check('reloaded, re-displayed Finish matches exactly what the user entered',
    isoDate(toHumanFinishInclusive(reloadedTask.earlyFinish)) === humanFinish);
}

console.log('\n8. No cumulative +/-1 drift after multiple edit/save cycles');
{
  let humanStart = '2026-10-01';
  let humanFinish = '2026-10-05';
  const originalStart = humanStart, originalFinish = humanFinish;

  // Simulate 10 rounds of: stage the CURRENTLY-DISPLAYED dates unchanged ->
  // save -> reload -> re-display. If any conversion in the chain were
  // asymmetric, the visible dates would creep by 1 day per cycle.
  for (let i = 0; i < 10; i++) {
    const state = stageTaskDates(createEmptyDraftState(), 'wp.a', humanStart, humanFinish);
    const [change] = toChangesArray(state);
    const persisted = simulateRpcPersist(change);
    humanStart = isoDate(persisted.earlyStart);
    humanFinish = isoDate(toHumanFinishInclusive(persisted.earlyFinish));
  }

  check('Start is byte-identical to the original after 10 edit/save/reload cycles', humanStart === originalStart);
  check('Finish is byte-identical to the original after 10 edit/save/reload cycles (no cumulative drift)', humanFinish === originalFinish);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
