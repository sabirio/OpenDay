// mergeGanttWPStatuses.test.mjs — regression tests for the progress=0 comparator fix.
// Run: node src/tests/mergeGanttWPStatuses.test.mjs
//
// mergeGanttWPStatuses is module-private in reportUtils.js; tested via the exported
// computeWPCumulativeStatuses which calls it directly.
//
// THE BUG (fixed): the old `(e?.progress ?? 0) || (statusScore * 100)` treated
// progress=0 as falsy, causing it to fall through to the status-score branch.
// So { progress:0, status:'In Progress' } scored 50 and beat { progress:20 } (=20),
// keeping the wrong entry and understating cumulative progress.
//
// THE FIX: explicit-numeric check via Number(); '' / null / undefined fall back to
// status score; any other numeric value (including 0) wins over the fallback.
//
// Test inventory:
//   1. Core regression — progress:0 must NOT beat progress:20
//   2. undefined progress falls back to status score (In Progress→50 > Not Started→0)
//   3. Empty-string progress ('') falls back to status score
//   4. Numeric-string progress ("60") treated as 60, beats In Progress(50)
//   5. 'Not Applicable' status resolves to 0, never wins over a real progress entry
//   6. Cumulative best: highest explicit progress across 3 reports; equal → first-seen

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeWPCumulativeStatuses } = await import('../utils/reportUtils.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

const DAY = 86_400_000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

// Helper: build a minimal WP report for a single task in phase 'ph' / task 'tk'.
const rep = (daysAgo, entry) => ({
  reportingDate: iso(now - daysAgo * DAY),
  workPackageStatuses: { ph: { tk: entry } },
});

// Read back the merged entry for ph→tk.
const merged = reports => computeWPCumulativeStatuses(reports)?.workPackageStatuses?.ph?.tk;

// ── 1. Core regression ─────────────────────────────────────────────────────────
// progress:0 on an older report must not beat an honest progress:20 on a newer one.
// Bug: old code → effectivePct({ progress:0, status:'In Progress' }) = 0||50 = 50
//                 effectivePct({ progress:20 })                      = 20||0  = 20
//                 50>20 → kept the 0-entry (wrong).
// Fix: effectivePct({ progress:0, ... }) = Number(0) = 0
//      effectivePct({ progress:20 })     = Number(20) = 20
//      20>0 → keeps the 20-entry (correct).
console.log('\n1) Core regression — progress:0 must not beat progress:20');
{
  const reports = [
    rep(7, { progress: 0, status: 'In Progress' }),  // older
    rep(0, { progress: 20, status: 'In Progress' }), // newer, higher
  ];
  const e = merged(reports);
  check('1a: merged entry has progress=20 (not 0)', e?.progress === 20);
  check('1b: merged entry status=In Progress',       e?.status === 'In Progress');
}

// ── 2. Undefined progress falls back to status score ──────────────────────────
// No progress field → effectivePct falls back to WP_STATUS_SCORES[status]*100.
// 'In Progress'(50) > 'Not Started'(0) → In-Progress entry wins.
console.log('\n2) undefined progress → status-score fallback');
{
  const reports = [
    rep(7, { status: 'Not Started' }),               // older, score=0
    rep(0, { status: 'In Progress' }),               // newer, score=50
  ];
  const e = merged(reports);
  check('2a: undefined progress + In Progress(50) beats Not Started(0)', e?.status === 'In Progress');
}
{
  // Reverse order (older has higher status score) — older should still win because
  // merge is cumulative-max, not latest-wins.
  const reports = [
    rep(7, { status: 'In Progress' }),               // older, score=50
    rep(0, { status: 'Not Started' }),               // newer, score=0
  ];
  const e = merged(reports);
  check('2b: undefined progress + older In Progress(50) beats newer Not Started(0)', e?.status === 'In Progress');
}

// ── 3. Empty-string progress falls back to status score ───────────────────────
// progress:'' is treated as "not provided" → falls back to status score.
// '' would make Number('')=0 but we short-circuit on raw==='' before calling Number().
console.log('\n3) empty-string progress → status-score fallback');
{
  const reports = [
    rep(7, { progress: '', status: 'Completed' }),   // older; '' → fallback → score=100
    rep(0, { progress: 30, status: 'In Progress' }), // newer; 30 explicit
  ];
  const e = merged(reports);
  // 'Completed' status score = 1.0*100 = 100 > 30 → Completed entry should win
  check('3a: empty-string progress → status-score used (Completed=100 > 30)', e?.status === 'Completed');
}
{
  const reports = [
    rep(7, { progress: 80, status: 'In Progress' }), // older; 80 explicit
    rep(0, { progress: '', status: 'Not Started' }), // newer; '' → score=0
  ];
  const e = merged(reports);
  // 80 > 0 → 80-entry wins
  check('3b: empty-string progress newer → older progress:80 wins', e?.progress === 80);
}

// ── 4. Numeric-string progress treated as number ──────────────────────────────
// progress:"60" → Number("60")=60 → beats In Progress status-score (50).
console.log('\n4) numeric-string progress → treated as 60');
{
  const reports = [
    rep(7, { status: 'In Progress' }),              // older; no progress → score=50
    rep(0, { progress: '60', status: 'In Progress' }), // newer; "60"→60
  ];
  const e = merged(reports);
  check('4a: progress:"60" (=60) beats In Progress fallback (50)', e?.progress === '60');
}
{
  // Numeric-string "60" vs explicit number 70 → 70 wins
  const reports = [
    rep(7, { progress: '60', status: 'In Progress' }),
    rep(0, { progress: 70, status: 'In Progress' }),
  ];
  const e = merged(reports);
  check('4b: progress:70 beats progress:"60"(=60)', e?.progress === 70);
}

// ── 5. 'Not Applicable' resolves to 0 ─────────────────────────────────────────
// WP_STATUS_SCORES['Not Applicable'] is undefined → (undefined ?? 0)*100 = 0.
// A real progress:1 must beat it.
console.log('\n5) Not Applicable → 0, never beats a real progress entry');
{
  const reports = [
    rep(7, { status: 'Not Applicable' }),            // older; score=0
    rep(0, { progress: 1, status: 'In Progress' }),  // newer; explicit 1
  ];
  const e = merged(reports);
  check('5a: Not Applicable(0) loses to progress:1', e?.progress === 1);
}
{
  // Not Applicable on newer: explicit progress:1 (older) must still win
  const reports = [
    rep(7, { progress: 1, status: 'In Progress' }),  // older; explicit 1
    rep(0, { status: 'Not Applicable' }),             // newer; score=0
  ];
  const e = merged(reports);
  check('5b: older progress:1 beats newer Not Applicable(0)', e?.progress === 1);
}
{
  // Two Not Applicable entries: first-seen wins (0 is not > 0)
  const reports = [
    rep(7, { status: 'Not Applicable' }),             // older, first
    rep(0, { status: 'Not Applicable' }),             // newer
  ];
  const e = merged(reports);
  // Both score 0 → older (first-seen) wins: cur stays, newer not strictly greater
  check('5c: two Not Applicable → first-seen entry kept', e?.status === 'Not Applicable');
}

// ── 6. Cumulative best across multiple reports; equal → first-seen ─────────────
console.log('\n6) Cumulative best across reports; equal progress → first-seen');
{
  // Three reports in chronological order: 10 → 50 → 30.
  // Merge should keep the peak (50).
  const reports = [
    rep(14, { progress: 10, status: 'In Progress' }),
    rep(7,  { progress: 50, status: 'In Progress' }),
    rep(0,  { progress: 30, status: 'In Progress' }),
  ];
  const e = merged(reports);
  check('6a: peak progress=50 kept across 3 reports', e?.progress === 50);
}
{
  // Equal progress: two reports both at 40. First-seen (older) must be kept.
  const rep1 = { progress: 40, status: 'In Progress', marker: 'first'  };
  const rep2 = { progress: 40, status: 'In Progress', marker: 'second' };
  const reports = [
    { reportingDate: iso(now - 7 * DAY), workPackageStatuses: { ph: { tk: rep1 } } },
    { reportingDate: iso(now),           workPackageStatuses: { ph: { tk: rep2 } } },
  ];
  const e = merged(reports);
  check('6b: equal progress → first-seen (marker=first) kept', e?.marker === 'first');
}
{
  // progress:0 explicitly across all reports — the fix must return 0, not fall through.
  // First-seen (older) entry kept when all are equal (0 is not > 0).
  const reports = [
    rep(14, { progress: 0, status: 'In Progress', marker: 'first'  }),
    rep(7,  { progress: 0, status: 'Completed',   marker: 'second' }),
    rep(0,  { progress: 0, status: 'Not Started', marker: 'third'  }),
  ];
  const e = merged(reports);
  // effectivePct for all three = 0 (explicit numeric 0) → none is strictly greater → first-seen wins
  check('6c: all progress:0 → first-seen kept (not status-score winner)', e?.marker === 'first');
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
