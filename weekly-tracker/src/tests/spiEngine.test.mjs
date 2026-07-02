// spiEngine.test.mjs — tests for the three pure SPI calc functions.
// No Supabase dependency; spiEngine.js has no imports at all.
// Run: node src/tests/spiEngine.test.mjs

import { computePlannedPct, computeSPIFromTasks, computeCriticalHealth } from '../engines/spiEngine.js';

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

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
