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

const { buildWeekOverWeekComparison, calculateProgressComparison, calculateProjectProgress, calculateProjectProgressResult, calculateWPTaskWeightedProgress, calculateRawWPAverageProgress, calculateGanttPhaseAverageProgress, calculatePhaseAverageProgressWithOverrides, getWPStatusTier, getDefaultProgressForGanttStatus, formatScheduleGapPp, countTasksByStatus } =
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

  // Engine-audit regression (2026-07-16): calculateProjectProgressResult()
  // used to hardcode phaseWeightOverrides to null instead of threading it
  // through like its sibling calculateProjectProgress() does — silently
  // corrupting progress_history.overall_progress for any project using
  // scope.weightOverrides. Same fixture as above (full scope, no scope
  // filter) so the only variable is the override.
  const overrides = { phase_a: 90, phase_b: 10 };
  const overriddenProgress = calculateProjectProgress(wpStatuses, null, overrides, template);
  const overriddenResult = calculateProjectProgressResult(
    { workPackageStatuses: wpStatuses },
    null,
    null,
    template,
    overrides
  );
  assert('calculateProjectProgress with 90/10 override → 45%', overriddenProgress === 45);
  assert(
    'calculateProjectProgressResult matches calculateProjectProgress for the same override (was silently ignored)',
    overriddenResult.progress === overriddenProgress
  );
  assert('override actually changes the result vs. default weights (25%)', overriddenResult.progress !== 25);
}

// ── calculateWPTaskWeightedProgress — pins PhaseStepper.jsx's former local
// wpProgress() exactly (values captured from the pre-refactor implementation
// before it was moved here; architecture-conformance pass, no logic change) ──
console.log('\ncalculateWPTaskWeightedProgress — pinned against pre-refactor PhaseStepper.wpProgress() output');
{
  // Legacy config/workPackages.js-style WP: real per-task weights (40/30/20/10).
  const wpLegacy = { id: 'precon', tasks: [
    { name: 'Site setup & hoarding',  weight: 40 },
    { name: 'Temporary utilities',    weight: 30 },
    { name: 'Shop drawings approval', weight: 20 },
    { name: 'Material procurement',   weight: 10 },
  ]};
  const statusesLegacy = { precon: {
    'Site setup & hoarding':  { status: 'Completed',   progress: 0 },
    'Temporary utilities':    { status: 'In Progress', progress: 60 },
    'Shop drawings approval': { status: 'Not Started', progress: 0 },
    // 'Material procurement' has no entry at all — must be excluded, not scored as 0.
  }};
  assert('legacy weighted WP (mixed statuses, one untouched task) pins to 64',
    calculateWPTaskWeightedProgress(wpLegacy, statusesLegacy) === 64);

  // masterTaskLibrary-style WP: every task weight 1 (plain average), includes a
  // 'Not Applicable' entry that must be excluded entirely (score is null, not 0).
  const wpGantt = { id: 'testing', tasks: [
    { name: 'Electrical Testing',     weight: 1 },
    { name: 'HVAC Pressure Test',     weight: 1 },
    { name: 'Plumbing Pressure Test', weight: 1 },
  ]};
  const statusesGantt = { testing: {
    'Electrical Testing':     { status: 'Completed',      progress: 100 },
    'HVAC Pressure Test':     { status: 'Not Applicable', progress: 0 },
    'Plumbing Pressure Test': { status: 'In Progress',    progress: 25 },
  }};
  assert("gantt-style WP (all weight 1, one 'Not Applicable' excluded) pins to 63",
    calculateWPTaskWeightedProgress(wpGantt, statusesGantt) === 63);

  assert('no entries at all -> 0, not NaN', calculateWPTaskWeightedProgress(wpLegacy, {}) === 0);

  // progress===0 with a non-zero-score status falls back to the status score
  // (progress > 0 check, not progress != null) — Completed/Delayed at 0% still
  // contribute their status score, not 0.
  const wpEdge = { id: 'x', tasks: [{ name: 'a', weight: 5 }, { name: 'b', weight: 5 }] };
  const statusesEdge = { x: {
    a: { status: 'Completed', progress: 0 },
    b: { status: 'Delayed',   progress: 0 },
  }};
  assert("progress:0 with Completed/Delayed status falls back to status score, pins to 65",
    calculateWPTaskWeightedProgress(wpEdge, statusesEdge) === 65);
}

// ── calculateRawWPAverageProgress — pins ContractorReport.jsx's former local
// contractorRawAverageProgress calc exactly (V3 audit follow-up to F1/F2/F3) ──
console.log('\ncalculateRawWPAverageProgress — pinned against pre-refactor ContractorReport.jsx output');
{
  const wps = [{ progress_pct: 50 }, { progress_pct: 80 }, { progress_pct: 33 }];
  assert('3-WP raw average rounds to 54', calculateRawWPAverageProgress(wps, 999) === 54);
  assert('empty array falls back to the supplied cumulative progress', calculateRawWPAverageProgress([], 42) === 42);
  assert('rounds .5 up (1,2 -> 1.5 -> 2)', calculateRawWPAverageProgress([{ progress_pct: 1 }, { progress_pct: 2 }], 0) === 2);
}

// ── calculateGanttPhaseAverageProgress — pins GanttChart.jsx's former local
// collapsed-phase-band avg calc exactly (V3 audit follow-up to F1/F2/F3) ──────
console.log('\ncalculateGanttPhaseAverageProgress — pinned against pre-refactor GanttChart.jsx output');
{
  assert('mixed tasks (50,75,null->0) average to 42',
    calculateGanttPhaseAverageProgress([{ actual_progress: 50 }, { actual_progress: 75 }, { actual_progress: null }]) === 42);
  assert('single task returns its own value', calculateGanttPhaseAverageProgress([{ actual_progress: 33 }]) === 33);
  assert('all-undefined tasks average to 0', calculateGanttPhaseAverageProgress([{}, {}]) === 0);
  assert('empty array returns 0, not NaN (defensive; callers already guard this)', calculateGanttPhaseAverageProgress([]) === 0);
}

// ── calculatePhaseAverageProgressWithOverrides — pins GanttWPSection.jsx's
// former local phasePct calc exactly (V3 audit follow-up to F1/F2/F3) ────────
console.log('\ncalculatePhaseAverageProgressWithOverrides — pinned against pre-refactor GanttWPSection.jsx output');
{
  assert('override for task a wins over its actual_progress (55)',
    calculatePhaseAverageProgressWithOverrides(
      [{ id: 'a', actual_progress: 10 }, { id: 'b', actual_progress: 20 }],
      { a: { progress_pct: 90 } }
    ) === 55);
  assert('no overrides falls back to actual_progress for every task (50)',
    calculatePhaseAverageProgressWithOverrides(
      [{ id: 'a', actual_progress: 40 }, { id: 'b', actual_progress: 60 }], {}
    ) === 50);
  assert('empty task list -> 0', calculatePhaseAverageProgressWithOverrides([], {}) === 0);
  assert('no override and no actual_progress falls back to 0 for that task (25)',
    calculatePhaseAverageProgressWithOverrides(
      [{ id: 'a' }, { id: 'b', actual_progress: 50 }], {}
    ) === 25);
}

// ── getWPStatusTier — pinned against pre-refactor sharedUtils.statusColor()/
// PhaseStepper.jsx/PhaseTimeline.jsx local score-threshold duplicates
// (architecture-conformance pass: 3 UI files independently reimplemented
// this exact >=1/>=0.5/>=0.3 tiering) ───────────────────────────────────────
console.log('\ngetWPStatusTier — pinned against pre-refactor UI score-threshold duplicates');
{
  assert('Completed (score 1) -> done',        getWPStatusTier('Completed') === 'done');
  assert('In Progress (score 0.5) -> good',    getWPStatusTier('In Progress') === 'good');
  assert('Delayed (score 0.3) -> warn',        getWPStatusTier('Delayed') === 'warn');
  assert('Not Started (score 0) -> muted',     getWPStatusTier('Not Started') === 'muted');
  assert('Not Applicable (score null) -> muted (?? 0 fallback)', getWPStatusTier('Not Applicable') === 'muted');
  assert('unknown status -> muted (?? 0 fallback)', getWPStatusTier('bogus-status') === 'muted');
  assert('undefined status -> muted, no throw', getWPStatusTier(undefined) === 'muted');
}

// ── getDefaultProgressForGanttStatus — pinned against pre-refactor
// GanttWPSection.jsx (contractor)/GanttPMTaskRow.jsx (PM site-visit) local
// duplicates (architecture-conformance pass) ────────────────────────────────
console.log('\ngetDefaultProgressForGanttStatus — pinned against pre-refactor GanttWPSection/GanttPMTaskRow duplicates');
{
  assert('completed -> always 100, regardless of current progress', getDefaultProgressForGanttStatus('completed', 40) === 100);
  assert('not_started -> always 0, regardless of current progress', getDefaultProgressForGanttStatus('not_started', 77) === 0);
  assert('in_progress -> keeps current progress unchanged',         getDefaultProgressForGanttStatus('in_progress', 42) === 42);
  assert('delayed -> keeps current progress unchanged',             getDefaultProgressForGanttStatus('delayed', 42) === 42);
  assert('blocked -> keeps current progress unchanged',             getDefaultProgressForGanttStatus('blocked', 42) === 42);
}

// ── formatScheduleGapPp ──────────────────────────────────────────────────────
{
  assert('formatScheduleGapPp(-7) = 7', formatScheduleGapPp(-7) === 7);
  assert('formatScheduleGapPp(7) = 7', formatScheduleGapPp(7) === 7);
  assert('formatScheduleGapPp(0) = 0', formatScheduleGapPp(0) === 0);
}

// ── countTasksByStatus ───────────────────────────────────────────────────────
{
  const pkgStatuses = {
    a: { status: 'Completed' },
    b: { status: 'In Progress' },
    c: { status: 'Completed' },
    d: { status: 'Not Started' },
  };
  const { completed, inProgress } = countTasksByStatus(['a', 'b', 'c', 'd', 'e'], pkgStatuses);
  assert('countTasksByStatus counts Completed', completed === 2);
  assert('countTasksByStatus counts In Progress', inProgress === 1);
  assert('countTasksByStatus ignores missing entries (task "e")', completed + inProgress === 3);
  assert('countTasksByStatus empty list -> zeros', countTasksByStatus([], {}).completed === 0);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${pass + fail} checks — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
