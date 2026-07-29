// spiEngine.test.mjs — tests for the three pure SPI calc functions.
// No Supabase dependency; spiEngine.js has no imports at all.
// Run: node src/tests/spiEngine.test.mjs

import { computePlannedPct, computeSPIFromTasks, computeCriticalHealth, computeCalendarSpi, computeProjectTrendPoints } from '../engines/spiEngine.js';
import { getSPIStatus } from '../config/statusColors.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

const DAY = 86_400_000;
const now = new Date();
const iso = (ms) => new Date(ms).toISOString();

// ── A) computePlannedPct ──────────────────────────────────────────────────────

console.log('\nA) computePlannedPct');

// A1: ref is before start → 0%
check('A1: ref < start → 0',
  computePlannedPct(iso(now.getTime() + DAY), iso(now.getTime() + 10 * DAY), now) === 0);

// A2: ref is after end → 100%
check('A2: ref > end → 100',
  computePlannedPct(iso(now.getTime() - 10 * DAY), iso(now.getTime() - DAY), now) === 100);

// A3: ref is exactly at midpoint → 50%
{
  const start = now.getTime() - 50 * DAY;
  const end   = now.getTime() + 50 * DAY;
  const pct   = computePlannedPct(iso(start), iso(end), now);
  check('A3: midpoint → 50%', Math.abs(pct - 50) < 1);
}

// A4: invalid / equal start+end → 100% (safe fallback)
check('A4: end === start → 100', computePlannedPct(iso(now.getTime()), iso(now.getTime()), now) === 100);
check('A4: bad strings → 100',   computePlannedPct('bad', 'date', now) === 100);

// A5: 75% through window
{
  const start = now.getTime() - 75 * DAY;
  const end   = now.getTime() + 25 * DAY;
  const pct   = computePlannedPct(iso(start), iso(end), now);
  check('A5: 75% through window', Math.abs(pct - 75) < 1);
}

// A6–A10: unscheduled dates (Simplification Phase 2 — null must NOT become
// the epoch and must NOT silently resolve to 100).
check('A6: null plannedStart → null (not epoch, not 100)',
  computePlannedPct(null, iso(now.getTime() + 10 * DAY), now) === null);
check('A7: null plannedEnd → null',
  computePlannedPct(iso(now.getTime() - 10 * DAY), null, now) === null);
check('A8: both null → null',
  computePlannedPct(null, null, now) === null);
check('A9: both undefined → null',
  computePlannedPct(undefined, undefined, now) === null);
check('A10: null start with valid-looking end still → null (not coerced to epoch start)',
  computePlannedPct(null, iso(now.getTime()), now) === null);

// ── B) computeSPIFromTasks — normal path ──────────────────────────────────────

console.log('\nB) computeSPIFromTasks — normal operation');

// B1: empty array → null
check('B1: no tasks → null', computeSPIFromTasks([]) === null);

// B2: all tasks archived → null
{
  const tasks = [{ is_archived: true, actual_progress: 50,
    planned_start: iso(now.getTime() - 100 * DAY), planned_end: iso(now.getTime() + 100 * DAY) }];
  check('B2: all archived → null', computeSPIFromTasks(tasks) === null);
}

// B3: schedule not yet started (avgPlanned < 1) → null
{
  const tasks = [{ is_archived: false, actual_progress: 0,
    planned_start: iso(now.getTime() + 30 * DAY), planned_end: iso(now.getTime() + 130 * DAY) }];
  check('B3: not yet started → null', computeSPIFromTasks(tasks) === null);
}

// B4: SPI = 1.0 — actual matches planned
{
  const start = iso(now.getTime() - 50 * DAY);
  const end   = iso(now.getTime() + 50 * DAY);
  // planned ≈ 50%, actual = 50 → SPI ≈ 1
  const tasks = [{ is_archived: false, actual_progress: 50, planned_start: start, planned_end: end }];
  const spi = computeSPIFromTasks(tasks);
  check('B4: SPI ≈ 1.0 when on schedule', spi !== null && Math.abs(spi - 1) < 0.05);
}

// B5: SPI behind (actual < planned)
{
  const start = iso(now.getTime() - 80 * DAY);
  const end   = iso(now.getTime() + 20 * DAY);  // 80% through
  const tasks = [{ is_archived: false, actual_progress: 40, planned_start: start, planned_end: end }];
  const spi = computeSPIFromTasks(tasks);
  check('B5: behind schedule → SPI < 1', spi !== null && spi < 1);
}

// ── C) computeSPIFromTasks — stale-Gantt null guard ──────────────────────────

console.log('\nC) computeSPIFromTasks — stale-Gantt null guard');

// C1: sumActual === 0 AND avgPlanned >= 80 → null (not critical!)
{
  // Schedule 90% elapsed, all actual_progress = 0 → stale Gantt
  const start = iso(now.getTime() - 90 * DAY);
  const end   = iso(now.getTime() + 10 * DAY);
  const tasks = [
    { is_archived: false, actual_progress: 0, planned_start: start, planned_end: end },
    { is_archived: false, actual_progress: 0, planned_start: start, planned_end: end },
  ];
  check('C1: wiped Gantt (0 actual, 90% elapsed) → null', computeSPIFromTasks(tasks) === null);
}

// C2: guard does NOT fire when avgPlanned < 80 (early project — 0 actual is genuine)
{
  const start = iso(now.getTime() - 30 * DAY);
  const end   = iso(now.getTime() + 70 * DAY);  // 30% elapsed
  const tasks = [{ is_archived: false, actual_progress: 0, planned_start: start, planned_end: end }];
  const spi = computeSPIFromTasks(tasks);
  // avgPlanned ≈ 30 < 80 → guard does NOT fire → SPI returned (0/30 = 0.00)
  check('C2: early project, 0 actual, low planned → SPI returned (not null)', spi !== null);
  check('C2: SPI = 0.00 for early project with no progress', spi === 0);
}

// C3: guard does NOT fire when some tasks have actual_progress > 0
{
  const start = iso(now.getTime() - 90 * DAY);
  const end   = iso(now.getTime() + 10 * DAY);
  const tasks = [
    { is_archived: false, actual_progress: 0,  planned_start: start, planned_end: end },
    { is_archived: false, actual_progress: 30, planned_start: start, planned_end: end },
  ];
  const spi = computeSPIFromTasks(tasks);
  // sumActual = 30 > 0 → guard does NOT fire
  check('C3: partial progress → guard not triggered, SPI returned', spi !== null);
}

// ── C-U) computeSPIFromTasks — unscheduled tasks (Simplification Phase 2) ────

console.log('\nC-U) computeSPIFromTasks — unscheduled tasks');

// CU1: a single fully-unscheduled task → null (no fabricated 0/100 SPI)
{
  const tasks = [{ is_archived: false, actual_progress: 0, planned_start: null, planned_end: null }];
  check('CU1: single unscheduled task → null', computeSPIFromTasks(tasks) === null);
}

// CU2: entirely-unscheduled project (several tasks, all null dates) → null
{
  const tasks = [
    { is_archived: false, actual_progress: 0,  planned_start: null, planned_end: null },
    { is_archived: false, actual_progress: 10, planned_start: null, planned_end: null },
  ];
  check('CU2: all-unscheduled project → null (honest no-schedule, not a fabricated ratio)',
    computeSPIFromTasks(tasks) === null);
}

// CU3: mixed scheduled + unscheduled — SPI computed only from the scheduled
// subset; the unscheduled task neither dilutes sumPlanned nor contributes
// its actual_progress.
{
  const start = iso(now.getTime() - 50 * DAY);
  const end   = iso(now.getTime() + 50 * DAY);
  const scheduledOnly = computeSPIFromTasks([
    { is_archived: false, actual_progress: 50, planned_start: start, planned_end: end },
  ]);
  const mixed = computeSPIFromTasks([
    { is_archived: false, actual_progress: 50, planned_start: start, planned_end: end },
    { is_archived: false, actual_progress: 0,  planned_start: null,  planned_end: null },
  ]);
  check('CU3: unscheduled task does not change SPI computed from scheduled tasks alone',
    scheduledOnly !== null && mixed !== null && Math.abs(scheduledOnly - mixed) < 0.001);
}

// ── D) computeCriticalHealth ──────────────────────────────────────────────────

console.log('\nD) computeCriticalHealth');

// D1: no critical tasks → healthy with zeros
{
  const tasks = [{ is_critical: false, is_archived: false, actual_progress: 50,
    planned_start: iso(now.getTime() - 50 * DAY), planned_end: iso(now.getTime() + 50 * DAY) }];
  const h = computeCriticalHealth(tasks);
  check('D1: no critical tasks → total=0', h.total === 0);
  check('D1: no critical tasks → label=healthy', h.label === 'healthy');
}

// D2: all critical tasks on track → healthy
{
  const start = iso(now.getTime() - 50 * DAY);
  const end   = iso(now.getTime() + 50 * DAY);
  // planned ≈ 50%, actual = 55 → ahead, not behind by >5
  const tasks = [{ is_critical: true, is_archived: false, actual_progress: 55,
    planned_start: start, planned_end: end }];
  const h = computeCriticalHealth(tasks);
  check('D2: critical on track → behind=0', h.behind === 0);
  check('D2: critical on track → label=healthy', h.label === 'healthy');
}

// D3: critical tasks behind → critical label (all behind = ratio 1.0)
{
  const start = iso(now.getTime() - 90 * DAY);
  const end   = iso(now.getTime() + 10 * DAY);  // 90% planned
  // actual = 20, planned ≈ 90 → behind by >5
  const tasks = [
    { is_critical: true, is_archived: false, actual_progress: 20, planned_start: start, planned_end: end },
    { is_critical: true, is_archived: false, actual_progress: 20, planned_start: start, planned_end: end },
  ];
  const h = computeCriticalHealth(tasks);
  check('D3: all critical behind → label=critical', h.label === 'critical');
  check('D3: all critical behind → ratio=1', h.ratio === 1);
}

// D4: archived critical tasks excluded
{
  const start = iso(now.getTime() - 90 * DAY);
  const end   = iso(now.getTime() + 10 * DAY);
  const tasks = [{ is_critical: true, is_archived: true, actual_progress: 5, planned_start: start, planned_end: end }];
  const h = computeCriticalHealth(tasks);
  check('D4: archived critical excluded → total=0', h.total === 0);
}

// D5: unscheduled critical task excluded from total/behind (Simplification Phase 2)
{
  const start = iso(now.getTime() - 90 * DAY);
  const end   = iso(now.getTime() + 10 * DAY);
  const tasks = [
    { is_critical: true, is_archived: false, actual_progress: 20, planned_start: start, planned_end: end }, // behind
    { is_critical: true, is_archived: false, actual_progress: 0,  planned_start: null,  planned_end: null }, // unscheduled
  ];
  const h = computeCriticalHealth(tasks);
  check('D5: unscheduled critical task excluded from total', h.total === 1);
  check('D5: unscheduled critical task excluded from behind count', h.behind === 1);
}

// D6: ALL critical tasks unscheduled → healthy/zeroed, not fabricated "behind"
{
  const tasks = [
    { is_critical: true, is_archived: false, actual_progress: 0, planned_start: null, planned_end: null },
    { is_critical: true, is_archived: false, actual_progress: 0, planned_start: null, planned_end: null },
  ];
  const h = computeCriticalHealth(tasks);
  check('D6: all critical unscheduled → total=0 (no fabricated critical judgement)', h.total === 0);
  check('D6: all critical unscheduled → label=healthy (matches existing "no critical tasks" shape)', h.label === 'healthy');
}

// ── E) computeCalendarSpi ─────────────────────────────────────────────────────

console.log('\nE) computeCalendarSpi');

// E1: normal case — rounds to 2dp
check('E1: 75/100 → 0.75',  computeCalendarSpi(75, 100) === 0.75);
check('E2: 1/3 → 0.33',     computeCalendarSpi(1, 3) === 0.33);
check('E3: 100/100 → 1',    computeCalendarSpi(100, 100) === 1);

// E4: expectedPct = 0 → null
check('E4: expectedPct=0 → null', computeCalendarSpi(50, 0) === null);

// E5: expectedPct = null → null
check('E5: expectedPct=null → null', computeCalendarSpi(50, null) === null);

// E6: expectedPct undefined → null
check('E6: expectedPct=undefined → null', computeCalendarSpi(50, undefined) === null);

// E7: actualPct = 0, expectedPct > 0 → 0 (not null)
check('E7: actualPct=0, expectedPct=50 → 0', computeCalendarSpi(0, 50) === 0);

// E8: rounding to 2dp
check('E8: 2/3 rounds to 0.67', computeCalendarSpi(2, 3) === 0.67);

// ── F) getSPIStatus boundaries ────────────────────────────────────────────────

console.log('\nF) getSPIStatus');

// F1: >= 0.95 → on_schedule
check('F1: 0.95 → on_schedule', getSPIStatus(0.95) === 'on_schedule');
check('F2: 1.0 → on_schedule',  getSPIStatus(1.0)  === 'on_schedule');
check('F3: 1.5 → on_schedule',  getSPIStatus(1.5)  === 'on_schedule');

// F4: >= 0.80 and < 0.95 → at_risk
check('F4: 0.80 → at_risk',     getSPIStatus(0.80) === 'at_risk');
check('F5: 0.94 → at_risk',     getSPIStatus(0.94) === 'at_risk');

// F6: < 0.80 → critical
check('F6: 0.79 → critical',    getSPIStatus(0.79) === 'critical');
check('F7: 0 → critical',       getSPIStatus(0)    === 'critical');

// F8: null / undefined → no_schedule
check('F8: null → no_schedule',      getSPIStatus(null)      === 'no_schedule');
check('F9: undefined → no_schedule', getSPIStatus(undefined) === 'no_schedule');

// ── G) computeProjectTrendPoints ─────────────────────────────────────────────

console.log('\nG) computeProjectTrendPoints');

{
  const reportDate = now.toISOString().slice(0, 10);
  const start = iso(now.getTime() - 50 * DAY);
  const end   = iso(now.getTime() + 50 * DAY);
  const trend = computeProjectTrendPoints(
    [{ report_date: reportDate, week_number: 12, overall_progress: 25 }],
    [
      { is_archived: false, planned_start: start, planned_end: end },
      { is_archived: true, planned_start: start, planned_end: end },
    ]
  );
  check('G1: emits one trend point', trend.length === 1);
  check('G2: week label preserved', trend[0].weekLabel === 'W12');
  check('G3: plannedAvg rounds planned percentage', Math.abs(trend[0].plannedAvg - 50) <= 1);
  check('G4: spi computed from actual/planned', trend[0].spi !== null && Math.abs(trend[0].spi - 0.5) <= 0.02);
}

// G5: unscheduled task in the mix does not drag plannedAvg toward 0
// (Simplification Phase 2) — excluded from the average, not counted as 0.
{
  const reportDate = now.toISOString().slice(0, 10);
  const start = iso(now.getTime() - 50 * DAY);
  const end   = iso(now.getTime() + 50 * DAY);
  const trend = computeProjectTrendPoints(
    [{ report_date: reportDate, week_number: 12, overall_progress: 25 }],
    [
      { is_archived: false, planned_start: start, planned_end: end },
      { is_archived: false, planned_start: null,  planned_end: null }, // unscheduled
    ]
  );
  check('G5: unscheduled task excluded, plannedAvg still ≈50 (not diluted toward 0)',
    Math.abs(trend[0].plannedAvg - 50) <= 1);
}

// G6: every task unscheduled → plannedAvg/spi null, not 0
{
  const reportDate = now.toISOString().slice(0, 10);
  const trend = computeProjectTrendPoints(
    [{ report_date: reportDate, week_number: 12, overall_progress: 25 }],
    [{ is_archived: false, planned_start: null, planned_end: null }]
  );
  check('G6: all-unscheduled tasks → plannedAvg=null', trend[0].plannedAvg === null);
  check('G6: all-unscheduled tasks → spi=null', trend[0].spi === null);
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
