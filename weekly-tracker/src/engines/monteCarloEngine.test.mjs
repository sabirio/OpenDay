// monteCarloEngine.test.mjs — AD-013 characterization tests.
// Goal: lock stochastic-engine invariants before AD-004 refactor.
// Uses the extensionless-import loader (same as src/tests/monteCarloEngine.test.mjs).
//
// DETERMINISM NOTE: computeMonteCarloForecast uses Math.random() (Box-Muller).
// All probability-value tests assert INVARIANTS that hold for any seed, not exact
// numbers. The probability-sum test asserts ±2 tolerance (not === 100) because
// pct = Math.round(n/N*100) is applied independently per bucket — the four rounded
// values can sum to 99 or 101 even though the underlying n-values sum exactly to N.
// See REPORTED BUG #1 in the report for details.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeMonteCarloForecast } = await import('./monteCarloEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

const DAY = 86_400_000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

// ── Fixtures ──────────────────────────────────────────────────────────────────
// status:'Not Started' keeps effectivePct=progress (avoids the status-score
// fallback that 'In Progress' with progress=0 triggers in the cumulative merge).

const mkRep = (pct, daysAgo) => ({
  workPackageStatuses: {
    rough_in: { 'Wall Marking & Setting Out': { progress: pct, status: 'Not Started' } },
  },
  reportingDate: iso(now - daysAgo * DAY),
});

// Increasing: progressPoints=[10,30,50], mu=20, sigma=0 → effectiveSigma=0.5
const REPS_INC = [mkRep(10, 14), mkRep(30, 7), mkRep(50, 0)];

// Exactly 2 reports — below minimum
const REPS_2 = [mkRep(20, 7), mkRep(40, 0)];

// Stalled: same progress → mu=0, effectiveSigma floor=0.5
const REPS_STALLED = [mkRep(40, 21), mkRep(40, 14), mkRep(40, 7)];

const PROJECT     = { targetOpeningDate: iso(now + 90 * DAY) };
const PROJECT_FAR = { targetOpeningDate: iso(now + 730 * DAY) };  // far future → pOnTime high

// ── A) Insufficient-data guards ───────────────────────────────────────────────

console.log('\nA) Insufficient-data guards');

check('A1: sortedReports undefined → insufficient_data',
  computeMonteCarloForecast(PROJECT, undefined).insufficient_data === true);

check('A2: sortedReports null → insufficient_data',
  computeMonteCarloForecast(PROJECT, null).insufficient_data === true);

check('A3: 0 reports → insufficient_data',
  computeMonteCarloForecast(PROJECT, []).insufficient_data === true);

check('A4: 1 report → insufficient_data',
  computeMonteCarloForecast(PROJECT, [mkRep(50, 0)]).insufficient_data === true);

check('A5: 2 reports (< 3) → insufficient_data',
  computeMonteCarloForecast(PROJECT, REPS_2).insufficient_data === true);

check('A6: no targetOpeningDate → insufficient_data',
  computeMonteCarloForecast({}, REPS_INC).insufficient_data === true);

check('A7: targetOpeningDate=undefined on otherwise valid project → insufficient_data',
  computeMonteCarloForecast({ targetOpeningDate: undefined }, REPS_INC).insufficient_data === true);

// A8: deltas.length === 0 guard — NOTE: this branch is unreachable when
// sortedReports.length >= 3 because progressPoints.length = sortedReports.length
// and deltas.length = progressPoints.length - 1 >= 2. The A1-A5 guards fire
// first. Tested here for documentation; behavior captured via the guard above.
check('A8: 3 identical-progress reports → NOT insufficient_data (sigma floor prevents stall)',
  computeMonteCarloForecast(PROJECT, REPS_STALLED).insufficient_data === false);

// ── B) Result shape ───────────────────────────────────────────────────────────

console.log('\nB) Result shape invariants');

{
  const r = computeMonteCarloForecast(PROJECT, REPS_INC);
  check('B1:  insufficient_data === false',        r.insufficient_data === false);
  check('B2:  simulations === 10000',              r.simulations       === 10000);
  check('B3:  currentProgress is number',          typeof r.currentProgress   === 'number');
  check('B4:  targetOpeningDate is Date object',   r.targetOpeningDate instanceof Date);
  check('B5:  p10 is Date object',                 r.p10 instanceof Date);
  check('B6:  p50 is Date object',                 r.p50 instanceof Date);
  check('B7:  p90 is Date object',                 r.p90 instanceof Date);
  check('B8:  pOnTime is integer',                 Number.isInteger(r.pOnTime));
  check('B9:  pDelay2Weeks is integer',            Number.isInteger(r.pDelay2Weeks));
  check('B10: pDelayMonth is integer',             Number.isInteger(r.pDelayMonth));
  check('B11: pDelayCritical is integer',          Number.isInteger(r.pDelayCritical));
  check('B12: highRisk is boolean',                typeof r.highRisk === 'boolean');
  check('B13: cone.optimistic  === p10',           r.cone?.optimistic  === r.p10);
  check('B14: cone.median      === p50',           r.cone?.median      === r.p50);
  check('B15: cone.pessimistic === p90',           r.cone?.pessimistic === r.p90);
}

// ── C) Probability invariants — hold for any random seed ─────────────────────

console.log('\nC) Probability invariants (seed-independent)');

{
  const r = computeMonteCarloForecast(PROJECT, REPS_INC);

  // C1: percentile ordering
  check('C1: p10.time <= p50.time', r.p10.getTime() <= r.p50.getTime());
  check('C2: p50.time <= p90.time', r.p50.getTime() <= r.p90.getTime());

  // C2: each probability in [0, 100]
  check('C3: pOnTime in [0,100]',      r.pOnTime      >= 0 && r.pOnTime      <= 100);
  check('C4: pDelay2Weeks in [0,100]', r.pDelay2Weeks >= 0 && r.pDelay2Weeks <= 100);
  check('C5: pDelayMonth in [0,100]',  r.pDelayMonth  >= 0 && r.pDelayMonth  <= 100);
  check('C6: pDelayCritical in [0,100]',r.pDelayCritical >= 0 && r.pDelayCritical <= 100);

  // C3: probability sum ≈ 100 (±2 tolerance due to independent Math.round per bucket).
  // NOTE: asserting === 100 would be flaky — see file header comment for explanation.
  const psum = r.pOnTime + r.pDelay2Weeks + r.pDelayMonth + r.pDelayCritical;
  check('C7: pct-sum in [98, 102] (rounding tolerance)', psum >= 98 && psum <= 102);

  // C4: highRisk definition — exactly pOnTime < 25
  check('C8: highRisk === (pOnTime < 25)', r.highRisk === (r.pOnTime < 25));
}

// ── D) Stalled project — structural (sigma floor prevents infinite loop) ──────

console.log('\nD) Stalled project (sigma=0 → effectiveSigma floor=0.5)');

{
  const r = computeMonteCarloForecast(PROJECT, REPS_STALLED);
  check('D1: stalled — not insufficient_data',   r.insufficient_data === false);
  check('D2: stalled — simulations=10000',        r.simulations       === 10000);
  check('D3: stalled — p50 is a Date',            r.p50 instanceof Date);
  // With mu=0 and sigma floor=0.5, progress advances ~0.5%/week on average.
  // currentProgress=40 → ~120 weeks expected. p50 > today is virtually certain.
  check('D4: stalled — p50 > today (sigma floor advances progress)',
    r.p50.getTime() > now);
}

// ── E) Far-future opening date → most sims finish on time ────────────────────

console.log('\nE) Increasing project vs far-future target');

{
  // REPS_INC: currentProgress=50, mu=20, sigma≈0. With good progress,
  // most sims finish in a few weeks. A 730-day target → pOnTime should be high.
  const r = computeMonteCarloForecast(PROJECT_FAR, REPS_INC);
  check('E1: far-future target → pOnTime > 50 (most sims finish on time)',
    r.pOnTime > 50);
  check('E2: far-future target → highRisk = false', r.highRisk === false);
}

// ── F) Deterministic via Math.random stub ─────────────────────────────────────
// ZERO stub: u=0.5, v=0.25 → cos(2π*0.25)=0 → randomNormal≈0
// delta = mu + 0 = mu every iteration.
// REPS_INC: mu=20, currentProgress=50 → weeks=ceil(50/20)=3 → p50≈today+21d.

console.log('\nF) Deterministic via Math.random=0 stub');

{
  const orig = Math.random;
  let c = 0;
  globalThis.Math.random = () => (c++ % 2 === 0 ? 0.5 : 0.25);

  const r = computeMonteCarloForecast(PROJECT, REPS_INC);

  globalThis.Math.random = orig;

  check('F1: zero stub → p50 is Date',        r.p50 instanceof Date);
  check('F2: zero stub → currentProgress=50', r.currentProgress === 50);
  // Expected: ceil((100-50)/20)=3 weeks → today+21d, ±1d for internal new Date()
  const expected = now + 3 * 7 * DAY;
  check('F3: zero stub → p50 ≈ today+21d (±1d)',
    Math.abs(r.p50.getTime() - expected) <= DAY);
  check('F4: zero stub → cone.median === p50', r.cone.median === r.p50);
  check('F5: zero stub → all sims identical → p10===p50',
    r.p10.getTime() === r.p50.getTime());
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
