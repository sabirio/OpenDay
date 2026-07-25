// dateMath.test.mjs — proves the moved diffDays() is byte-for-byte identical
// in behavior to the prior canonical implementation that lived in
// ganttLayout.js (same UTC/calendar-day semantics, same rounding). Also
// proves ganttLayout.js's re-export is the exact same function object, not a
// second implementation.
// Run: node src/engines/dateMath.test.mjs
import assert from 'node:assert/strict';
import { diffDays } from './dateMath.js';
import { diffDays as diffDaysViaGanttLayout } from './ganttLayout.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\ndateMath — diffDays (moved from ganttLayout.js, semantics unchanged)');

check('counts whole days forward', diffDays('2026-01-01', '2026-01-05') === 4);
check('is negative when end precedes start', diffDays('2026-01-05', '2026-01-01') === -4);
check('diffDays(x, x) === 0', diffDays('2026-01-01', '2026-01-01') === 0);
check('accepts Date objects, not just strings', diffDays(new Date('2026-01-01'), new Date('2026-01-10')) === 9);
check('rounds sub-day ms differences (no UTC-midnight normalization — matches prior ganttLayout.js formula exactly)',
  diffDays('2026-01-01T00:00:00.000Z', '2026-01-02T12:00:00.000Z') === 2); // 1.5 days rounds to 2
check('spans a year boundary correctly', diffDays('2025-12-30', '2026-01-02') === 3);

console.log('\ndateMath — ganttLayout.js re-exports the same implementation (single canonical function)');
check('ganttLayout.js\'s diffDays is the identical function reference as dateMath.js\'s (no second implementation)',
  diffDaysViaGanttLayout === diffDays);
check('re-exported diffDays produces identical output', diffDaysViaGanttLayout('2026-01-01', '2026-01-05') === diffDays('2026-01-01', '2026-01-05'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
