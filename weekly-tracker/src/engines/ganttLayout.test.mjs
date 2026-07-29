// ganttLayout.test.mjs — F-11 regression: buildArrows()/calculateLayout()
// must pick the dependency-rule set matching the project's templateType,
// not always the v1 set. Before this fix, a v2 project's WP ids never
// matched any v1 rule, so calculateLayout().arrows was always empty for v2.
// Run: node src/engines/ganttLayout.test.mjs

import { calculateLayout, diffDays, pixelsToDays, MIN_PIXELS, computeDragEditDates, durationDaysFromRange } from './ganttLayout.js';
import { filterRulesForWPsV2 } from '../config/dependencyRulesV2.js';
import { V2_TEMPLATE_TYPE } from '../domains/construction/templates/retailFitoutV2.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

// Two real v1 WPs connected by a real dependencyRules.js rule
// (demo.strip_out -> floor.screed).
function v1GanttResult() {
  return [
    { id: 'demo.strip_out', phaseId: 'demolition', phaseLabel: 'Demolition', phaseOrder: 1,
      earlyStart: new Date('2026-08-01'), earlyFinish: new Date('2026-08-03'), duration_days: 2 },
    { id: 'floor.screed', phaseId: 'floor_prep', phaseLabel: 'Floor Preparation', phaseOrder: 2,
      earlyStart: new Date('2026-08-04'), earlyFinish: new Date('2026-08-06'), duration_days: 2 },
  ];
}

// Two real v2 WPs connected by a real dependencyRulesV2.js rule
// (sales.flooring.waterproof -> sales.flooring.tile, 2-day cure lag).
function v2GanttResult() {
  return [
    { id: 'sales.flooring.waterproof', phaseId: 'sales', phaseLabel: 'Sales Area', phaseOrder: 1,
      earlyStart: new Date('2026-08-01'), earlyFinish: new Date('2026-08-03'), duration_days: 2 },
    { id: 'sales.flooring.tile', phaseId: 'sales', phaseLabel: 'Sales Area', phaseOrder: 1,
      earlyStart: new Date('2026-08-06'), earlyFinish: new Date('2026-08-08'), duration_days: 2 },
  ];
}

console.log('\ncalculateLayout — F-11: v2 project now gets real dependency arrows');
{
  const layout = calculateLayout(v2GanttResult(), 'month', 900, {}, [], {}, V2_TEMPLATE_TYPE);
  check('v2 templateType produces at least one arrow (was always 0 before the fix)',
    layout.arrows.length > 0);

  const expectedRules = filterRulesForWPsV2(v2GanttResult().map(w => w.id));
  check('v2 arrow count matches filterRulesForWPsV2() directly (the real v2 rule source, not a reinvented one)',
    layout.arrows.length === expectedRules.length);
  check('the v2 arrow actually connects the two real WPs from the rule (waterproof -> tile)',
    layout.arrows.some(a => a.fromWPId === 'sales.flooring.waterproof' && a.toWPId === 'sales.flooring.tile'));
}

console.log('\ncalculateLayout — F-11: v2 WP ids produce ZERO arrows when templateType is omitted (documents the pre-fix symptom)');
{
  const layoutNoType = calculateLayout(v2GanttResult(), 'month', 900, {}, [], {}, null);
  check('v2 WPs + no templateType -> 0 arrows (v1 rule set has no matching ids — this was the bug\'s exact mechanism)',
    layoutNoType.arrows.length === 0);
}

console.log('\ncalculateLayout — F-11: v1 project is byte-identical regardless of what templateType value a v1 caller passes');
{
  const layoutOmitted = calculateLayout(v1GanttResult(), 'month', 900, {}, [], {});
  const layoutNull     = calculateLayout(v1GanttResult(), 'month', 900, {}, [], {}, null);
  const layoutNamed    = calculateLayout(v1GanttResult(), 'month', 900, {}, [], {}, 'standard_with_demo');

  check('v1 still produces its real arrow (demo.strip_out -> floor.screed) with templateType omitted',
    layoutOmitted.arrows.length === 1 &&
    layoutOmitted.arrows[0].fromWPId === 'demo.strip_out' && layoutOmitted.arrows[0].toWPId === 'floor.screed');
  check('v1 result is byte-identical (JSON) whether templateType is omitted, explicitly null, or a named v1 template',
    JSON.stringify(layoutOmitted.arrows) === JSON.stringify(layoutNull.arrows) &&
    JSON.stringify(layoutOmitted.arrows) === JSON.stringify(layoutNamed.arrows));
}

console.log('\ndiffDays / pixelsToDays / MIN_PIXELS — drag-resize helpers (GanttChart.jsx)');
{
  check('diffDays counts whole days forward', diffDays('2026-01-01', '2026-01-05') === 4);
  check('diffDays is negative when end precedes start', diffDays('2026-01-05', '2026-01-01') === -4);
  check('diffDays(x, x) === 0', diffDays('2026-01-01', '2026-01-01') === 0);
  check('pixelsToDays rounds to nearest whole day', pixelsToDays(100, 30) === 3);
  check('pixelsToDays handles negative drag (dragging left)', pixelsToDays(-100, 30) === -3);
  check('MIN_PIXELS is the documented 600px floor', MIN_PIXELS === 600);
}

console.log('\ncalculateLayout — Simplification Phase 2: unscheduled WPs (planned_start/end/duration null)');
{
  // Mixed list: scheduled, unscheduled, scheduled, unscheduled — must not
  // throw, must not use epoch dates, must not corrupt the scheduled bars.
  const mixed = [
    { id: 'a', phaseId: 'p1', phaseLabel: 'Phase 1', phaseOrder: 1,
      earlyStart: new Date('2026-08-01'), earlyFinish: new Date('2026-08-05'), duration_days: 4 },
    { id: 'b', phaseId: 'p1', phaseLabel: 'Phase 1', phaseOrder: 1,
      earlyStart: null, earlyFinish: null, duration_days: null },
    { id: 'c', phaseId: 'p1', phaseLabel: 'Phase 1', phaseOrder: 1,
      earlyStart: new Date('2026-08-10'), earlyFinish: new Date('2026-08-15'), duration_days: 5 },
    { id: 'd', phaseId: 'p1', phaseLabel: 'Phase 1', phaseOrder: 1,
      earlyStart: null, earlyFinish: null, duration_days: null },
  ];
  const layout = calculateLayout(mixed, 'month', 900, {}, [], {});
  check('mixed scheduled/unscheduled list does not throw and returns a layout', layout !== null);

  const byId = Object.fromEntries(layout.tasks.map(t => [t.id, t]));
  check('unscheduled task b: hasSchedule=false', byId.b.hasSchedule === false);
  check('unscheduled task b: x=null (no fake epoch position)', byId.b.x === null);
  check('unscheduled task b: width=0 (no bar)', byId.b.width === 0);
  check('unscheduled task d: hasSchedule=false', byId.d.hasSchedule === false);

  check('scheduled task a: hasSchedule=true', byId.a.hasSchedule === true);
  check('scheduled task a: has a real numeric x', typeof byId.a.x === 'number' && !Number.isNaN(byId.a.x));
  check('scheduled task c: has a real numeric x', typeof byId.c.x === 'number' && !Number.isNaN(byId.c.x));
  check('scheduled task c starts after scheduled task a (unscheduled b/d did not shift positions)',
    byId.c.x > byId.a.x + byId.a.width);

  // Timeline bounds must be derived only from the two real WP dates
  // (2026-08-01 .. 2026-08-15, padded -2/+5), not pulled toward 1970 by the
  // unscheduled rows' epoch coercion.
  check('timelineStart is anchored near the real scheduled window, not 1970 epoch',
    layout.timelineStart.getUTCFullYear() === 2026);
  check('timelineEnd is anchored near the real scheduled window, not 1970 epoch',
    layout.timelineEnd.getUTCFullYear() === 2026);
}

console.log('\ncalculateLayout — entirely-unscheduled task list (no bars, no crash, no epoch fallback window)');
{
  const allUnscheduled = [
    { id: 'x', phaseId: 'p1', phaseLabel: 'Phase 1', phaseOrder: 1,
      earlyStart: null, earlyFinish: null, duration_days: null },
    { id: 'y', phaseId: 'p1', phaseLabel: 'Phase 1', phaseOrder: 1,
      earlyStart: null, earlyFinish: null, duration_days: null },
  ];
  const layout = calculateLayout(allUnscheduled, 'month', 900, {}, [], {});
  check('all-unscheduled list does not throw', layout !== null);
  check('all-unscheduled: both tasks present as rows (still visible)', layout.tasks.length === 2);
  check('all-unscheduled: no task has a bar', layout.tasks.every(t => t.hasSchedule === false && t.width === 0));
  check('all-unscheduled: timeline falls back to a window anchored on today, not epoch/Invalid Date',
    !Number.isNaN(layout.timelineStart.getTime()) &&
    Math.abs(layout.timelineStart.getFullYear() - new Date().getFullYear()) <= 1);
  check('all-unscheduled: zero arrows (nothing has a position to connect)', layout.arrows.length === 0);
}

console.log('\ncomputeDragEditDates — Simplification Phase 3B: canonical move/resize date math');
{
  const origStart  = new Date('2026-08-10');
  const origFinish = new Date('2026-08-15'); // 5-day span

  // Whole-bar move: both edges shift by the same delta, duration preserved.
  {
    const r = computeDragEditDates(origStart, origFinish, 'move', 3);
    check('move +3 days: earlyStart shifts by 3', r.earlyStart.getTime() === new Date('2026-08-13').getTime());
    check('move +3 days: earlyFinish shifts by 3', r.earlyFinish.getTime() === new Date('2026-08-18').getTime());
    check('move: duration unchanged (5 days)', r.durationDays === 5);
  }
  {
    const r = computeDragEditDates(origStart, origFinish, 'move', -4);
    check('move -4 days: earlyStart shifts by -4', r.earlyStart.getTime() === new Date('2026-08-06').getTime());
    check('move -4 days: earlyFinish shifts by -4', r.earlyFinish.getTime() === new Date('2026-08-11').getTime());
    check('move -4 days: duration still unchanged', r.durationDays === 5);
  }

  // Resize right: start fixed, finish moves, duration changes.
  {
    const r = computeDragEditDates(origStart, origFinish, 'right', 2);
    check('resize right +2: earlyStart unchanged', r.earlyStart.getTime() === origStart.getTime());
    check('resize right +2: earlyFinish extends by 2', r.earlyFinish.getTime() === new Date('2026-08-17').getTime());
    check('resize right +2: duration grows to 7', r.durationDays === 7);
  }
  check('resize right: dragging finish onto/past start is clamped to a minimum 1-day span, never zero/negative',
    computeDragEditDates(origStart, origFinish, 'right', -20).durationDays >= 1);

  // Resize left: finish fixed, start moves, duration changes.
  {
    const r = computeDragEditDates(origStart, origFinish, 'left', -2);
    check('resize left -2: earlyFinish unchanged', r.earlyFinish.getTime() === origFinish.getTime());
    check('resize left -2: earlyStart moves earlier by 2', r.earlyStart.getTime() === new Date('2026-08-08').getTime());
    check('resize left -2: duration grows to 7', r.durationDays === 7);
  }
  check('resize left: dragging start onto/past finish is clamped to a minimum 1-day span, never zero/negative',
    computeDragEditDates(origStart, origFinish, 'left', 20).durationDays >= 1);

  // dxDays = 0 is a no-op for every handle.
  check('move with 0 delta is a no-op', computeDragEditDates(origStart, origFinish, 'move', 0).earlyStart.getTime() === origStart.getTime());
  check('right resize with 0 delta is a no-op', computeDragEditDates(origStart, origFinish, 'right', 0).earlyFinish.getTime() === origFinish.getTime());
  check('left resize with 0 delta is a no-op', computeDragEditDates(origStart, origFinish, 'left', 0).earlyStart.getTime() === origStart.getTime());
}

console.log('\ndurationDaysFromRange — manual Start/Finish staging duration display (Simplification Phase 3B)');
{
  check('7-day range -> 7', durationDaysFromRange(new Date('2026-09-01'), new Date('2026-09-08')) === 7);
  check('1-day range -> 1', durationDaysFromRange(new Date('2026-09-01'), new Date('2026-09-02')) === 1);
  check('same-day range floors to 1, never 0', durationDaysFromRange(new Date('2026-09-01'), new Date('2026-09-01')) === 1);
  check('end before start floors to 1, never negative', durationDaysFromRange(new Date('2026-09-05'), new Date('2026-09-01')) === 1);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
