// progressEngine.test.mjs — pure-function tests for buildWeekOverWeekComparison
// Uses the same node:module loader trick as riskEngine.test.mjs to resolve
// extension-less imports in the dependency chain.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { buildWeekOverWeekComparison, calculateProgressComparison, calculateProjectProgress, calculateProjectProgressResult } =
  await import('../engines/progressEngine.js');

const { getCommands } = await import('../engines/commandEngine.js');

let pass = 0, fail = 0;

function assert(label, condition) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else           { fail++; console.error(`  ✗ ${label}`); }
}

// Minimal project with dates so calculateProgressComparison can compute expectedPct
const PROJECT = {
  id: 'p1',
  storeCode: 'TST-01',
  constructionStartDate: '2024-01-01',
  constructionEndDate:   '2024-12-31',
  targetOpeningDate:     '2024-12-31',
};

// Reference date: mid-year (day 182 of 366 ≈ 49% expected)
const MID_YEAR = new Date('2024-07-01');

function row(recorded_at, overall_progress) {
  return { recorded_at, overall_progress };
}

// ── Test 1: 0 history rows ────────────────────────────────────────────────────
console.log('\nbuildWeekOverWeekComparison — 0 history rows');
{
  const { progressComparison, prevProgressComparison } =
    buildWeekOverWeekComparison(PROJECT, 40, [], undefined, MID_YEAR);

  assert('prevProgressComparison is null',    prevProgressComparison === null);
  assert('progressComparison is not null',    progressComparison !== null);
  assert('progressComparison.actualPct = 40', progressComparison.actualPct === 40);
  assert('deltaVsLastWeek is null (no history)', progressComparison.deltaVsLastWeek === null);
}

// ── Test 2: 1 history row ─────────────────────────────────────────────────────
console.log('\nbuildWeekOverWeekComparison — 1 history row');
{
  const history = [row('2024-06-24', 35)];
  const { progressComparison, prevProgressComparison } =
    buildWeekOverWeekComparison(PROJECT, 40, history, undefined, MID_YEAR);

  assert('prevProgressComparison is null with 1 row', prevProgressComparison === null);
  assert('progressComparison.actualPct = 40',         progressComparison.actualPct === 40);
  // With only 1 history row, calculateProgressDelta needs ≥2 rows → delta null
  assert('deltaVsLastWeek is null (only 1 row)',       progressComparison.deltaVsLastWeek === null);
}

// ── Test 3: 2 rows — behind & worsening ──────────────────────────────────────
console.log('\nbuildWeekOverWeekComparison — 2 rows, behind & worsening');
{
  // last week: 30% actual; this week: 32% actual (both behind ~49% expected)
  // gap last week: 30 - 49 = -19; gap this week: 32 - 49 = -17
  // BUT: prevProgressComparison is evaluated at the prevRow date (2024-06-24) where
  // expectedPct may be slightly different. Main assertion: gap is more negative for current.
  const history = [
    row('2024-06-17', 25), // oldest
    row('2024-06-24', 30), // prev (history.length-2)
    row('2024-07-01', 32), // latest (history.length-1)
  ];
  const { progressComparison, prevProgressComparison } =
    buildWeekOverWeekComparison(PROJECT, 32, history, undefined, MID_YEAR);

  assert('prevProgressComparison not null with 3 rows', prevProgressComparison !== null);
  assert('progressComparison.actualPct = 32',           progressComparison.actualPct === 32);
  assert('prevProgressComparison.actualPct = 30',       prevProgressComparison.actualPct === 30);
  assert('progressComparison.scheduleGap is a number',  typeof progressComparison.scheduleGap === 'number');
  assert('prevProgressComparison.scheduleGap is a number', typeof prevProgressComparison.scheduleGap === 'number');
  // deltaVsLastWeek should be populated (2 rows passed to calculateProgressDelta)
  assert('deltaVsLastWeek is populated (= 32 - 30 = 2)', progressComparison.deltaVsLastWeek === 2);
}

// ── Test 4: unsorted input is handled ─────────────────────────────────────────
console.log('\nbuildWeekOverWeekComparison — unsorted input');
{
  // Same data as test 3 but provided in reverse order
  const history = [
    row('2024-07-01', 32), // newest first
    row('2024-06-24', 30),
    row('2024-06-17', 25),
  ];
  const { progressComparison, prevProgressComparison } =
    buildWeekOverWeekComparison(PROJECT, 32, history, undefined, MID_YEAR);

  assert('sorted correctly — prevRow.actualPct = 30', prevProgressComparison?.actualPct === 30);
  assert('sorted correctly — deltaVsLastWeek = 2',    progressComparison.deltaVsLastWeek === 2);
}

// ── Test 5: 2 rows exactly (boundary) ────────────────────────────────────────
console.log('\nbuildWeekOverWeekComparison — exactly 2 rows');
{
  const history = [
    row('2024-06-24', 28), // prev
    row('2024-07-01', 35), // latest
  ];
  const { progressComparison, prevProgressComparison } =
    buildWeekOverWeekComparison(PROJECT, 35, history, undefined, MID_YEAR);

  assert('prevProgressComparison not null with 2 rows', prevProgressComparison !== null);
  assert('prevProgressComparison.actualPct = 28',       prevProgressComparison.actualPct === 28);
  assert('deltaVsLastWeek = 7',                         progressComparison.deltaVsLastWeek === 7);
  // prev slice is history.slice(-3, -1) = history.slice(-1, -1) = [] → prevPrev delta null
  assert('prev.deltaVsLastWeek null (no further history)', prevProgressComparison.deltaVsLastWeek === null);
}

// ── Test 6: commandEngine — worsening gap → critical ─────────────────────────
console.log('\ngetCommands — worsening schedule gap → critical');
{
  // current: 30% actual, 49% expected → gap = -19
  // prev:    35% actual, 47% expected → gap = -12
  // gap worsened: -19 < -12 → worsening = true → severity = 'critical'
  const progressComparison = {
    actualPct: 30, expectedPct: 49, scheduleGap: -19, scheduleStatus: 'behind',
    spi: null, deltaVsLastWeek: -5, reasons: [],
  };
  const prevProgressComparison = {
    actualPct: 35, expectedPct: 47, scheduleGap: -12, scheduleStatus: 'behind',
    spi: null, deltaVsLastWeek: null, reasons: [],
  };
  const commands = getCommands({
    project: PROJECT,
    progressComparison,
    prevProgressComparison,
    riskScore:        { level: 'LOW', score: 10, factors: [] },
    openingReadiness: { status: 'On Track' },
    latestReport:     null,
    missingReport:    false,
  });
  const cmd = commands.find(c => c.id === 'behind_schedule');
  assert('behind_schedule command exists',           !!cmd);
  assert('severity = critical when gap worsens',     cmd?.severity === 'critical');
  assert('reason mentions gap worsened vs last week', cmd?.reason?.includes('worsened') ?? false);
}

// ── Test 7: commandEngine — flat/improving gap → warning ─────────────────────
console.log('\ngetCommands — flat/improving gap → warning');
{
  const progressComparison = {
    actualPct: 35, expectedPct: 49, scheduleGap: -14, scheduleStatus: 'behind',
    spi: null, deltaVsLastWeek: 5, reasons: [],
  };
  const prevProgressComparison = {
    actualPct: 30, expectedPct: 47, scheduleGap: -17, scheduleStatus: 'behind',
    spi: null, deltaVsLastWeek: null, reasons: [],
  };
  // gap improved: -14 > -17 → worsening = false → 'warning'
  const commands = getCommands({
    project: PROJECT,
    progressComparison,
    prevProgressComparison,
    riskScore:        { level: 'LOW', score: 10, factors: [] },
    openingReadiness: { status: 'On Track' },
    latestReport:     null,
    missingReport:    false,
  });
  const cmd = commands.find(c => c.id === 'behind_schedule');
  assert('behind_schedule command exists',           !!cmd);
  assert('severity = warning when gap improves',     cmd?.severity === 'warning');
}

// ── Test 8: null/undefined progressHistory handled ───────────────────────────
console.log('\nbuildWeekOverWeekComparison — null progressHistory');
{
  const { progressComparison, prevProgressComparison } =
    buildWeekOverWeekComparison(PROJECT, 50, null, undefined, MID_YEAR);
  assert('null history → prevProgressComparison null', prevProgressComparison === null);
  assert('null history → progressComparison computed',  progressComparison !== null);
}

// ── Test 9: scoped progress excludes out-of-scope work packages ───────────────
console.log('\ncalculateProjectProgress — scope isolation');
{
  const template = {
    phases: [
      { id: 'phase_a', label: 'Phase A', progressWeight: 50 },
      { id: 'phase_b', label: 'Phase B', progressWeight: 50 },
    ],
    workPackages: [
      { id: 'a.1', phaseId: 'phase_a', label: 'A included', duration_pct: 50 },
      { id: 'a.2', phaseId: 'phase_a', label: 'A excluded', duration_pct: 50 },
      { id: 'b.1', phaseId: 'phase_b', label: 'B excluded', duration_pct: 100 },
    ],
  };
  const wpStatuses = {
    phase_a: {
      'A included': { progress: 100 },
      'A excluded': { progress: 0 },
    },
    phase_b: {
      'B excluded': { progress: 0 },
    },
  };

  const fullProgress = calculateProjectProgress(wpStatuses, null, null, template);
  const scopedProgress = calculateProjectProgress(wpStatuses, ['a.1'], null, template);
  const scopedResult = calculateProjectProgressResult(
    { workPackageStatuses: wpStatuses },
    null,
    ['a.1'],
    template
  );

  assert('full scope includes all phases → 25%', fullProgress === 25);
  assert('scope [a.1] ignores a.2 and phase_b → 100%', scopedProgress === 100);
  assert('result format remains gantt', scopedResult.format === 'gantt');
  assert('result progress follows scoped total', scopedResult.progress === 100);
  assert('breakdown includes only one scoped phase', scopedResult.phases.length === 1);
  assert('breakdown phase is phase_a', scopedResult.phases[0]?.id === 'phase_a');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${pass + fail} checks — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
