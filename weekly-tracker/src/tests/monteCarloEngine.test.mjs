// monteCarloEngine.test.mjs — zero-dependency smoke tests.
// Run: node src/tests/monteCarloEngine.test.mjs
//
// This engine is STOCHASTIC (Box-Muller, N=10 000). Tests cover:
//   A) Insufficient-data guards (pure, no sims)
//   B) Result structure invariants (real randomness)
//   C) Probability invariants that hold for any seed
//   D) Deterministic via Math.random stub (globalThis shim, restored after each section)
//   E) Declining-progress structural check (real random)
//
// ─── Math.random stub design ─────────────────────────────────────────────────
// randomNormal() = sqrt(-2*log(u)) * cos(2π*v)   where u=1-rand(), v=rand()
//
// ZERO stub: u=0.5, v=0.25 → cos(2π*0.25)=cos(π/2)=0 → randomNormal≈0
//   Math.random alternates [0.5, 0.25, 0.5, 0.25, ...]
//   With randomNormal≈0: delta = mu + sigma*0 = mu every iteration.
//
// NEGATIVE stub: u=0.0001, v=0.5 → cos(π)=-1 → randomNormal≈-sqrt(18.42)≈-4.29
//   Math.random alternates [0.9999, 0.5, 0.9999, 0.5, ...]
//   With randomNormal≈-4.29 and mu=-30, sigma=30: delta≈-159 → clipped to 0 every
//   iteration → progress never advances → all 10 000 sims hit MAX_WEEKS=520.
//
// ─── Fixture design (must use status:'Not Started') ──────────────────────────
// The cumulative-max merge uses effectivePct = (progress??0) || (statusScore*100).
// progress=0 with status='In Progress' gives effectivePct=50 (status fallback),
// which is HIGHER than progress=20 (effectivePct=20) or progress=40 (effectivePct=40),
// preventing those later reports from winning the merge.
// status='Not Started' has statusScore=0 → effectivePct=progress → monotonically
// increasing progress values work correctly as fixtures.
//
// ─── Confirmed fixture values (probed empirically) ──────────────────────────
// REPORTS_INC: [r(0,21), r(20,14), r(40,7), r(60,0)] → progressPoints=[0,20,40,60]
//   deltas=[20,20,20], mu=20, sigma=0, effectiveSigma=0.5, currentProgress=60
//   With ZERO stub: weeks=ceil((100-60)/20)=2, p50=today+14 days
// REPORTS_STALLED: [r(40,21), r(40,14), r(40,7)] → progressPoints=[40,40,40]
//   mu=0, sigma=0, effectiveSigma=0.5 (floor), currentProgress=40
// REPORTS_DEC: [r(80,21), r(80,14), dilution@7d] → progressPoints=[80,80,20]
//   dilution: TASK2 added in 3rd report with progress=0,status='In Progress'
//             effectivePct=50 → calculateActivityProgress returns 0 for TASK2
//             rough_in pct = (80*wA+0*wB)/(wA+wB) = 20 (wB/wA=3 from probe)
//   deltas=[0,-60], mu=-30, sigma=30, currentProgress=20
//   With NEGATIVE stub: delta≈-159 → 0 always → all sims hit MAX_WEEKS=520
//
// ─── Probability-sum tolerance ──────────────────────────────────────────────
// Each pct = Math.round(n/N*100). The four n-values sum exactly to N=10 000.
// Sum of n/N*100 = 100 exactly; after independent rounding each term can shift by
// ≤0.5, so sum is in [98,102]. This file asserts |sum-100| ≤ 2.
//
// NOT wired into runTests.js (that runner imports named exports from .js files).
// Run separately: node src/tests/monteCarloEngine.test.mjs
// Typical runtime: ~0.5 s for 5 invocations × N=10 000 sims
//   (D_B forces MAX_WEEKS=520 per sim: 5.2 M iterations, ~0.1 s in V8)

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeMonteCarloForecast } = await import('../engines/monteCarloEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

const DAY = 86_400_000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Task names from rough_in phase of masterTaskLibrary / constructionRetailV1
const TASK  = 'Wall Marking & Setting Out';
const TASK2 = 'Wall Framing / Partitions';

// Build a single-task WP report. status:'Not Started' keeps effectivePct=progress
// (avoids the effectivePct=50 fallback that 'In Progress' with progress=0 triggers).
const mkRep = (pct, daysAgo) => ({
  workPackageStatuses: { rough_in: { [TASK]: { progress: pct, status: 'Not Started' } } },
  reportingDate: iso(now - daysAgo * DAY),
});

// Increasing: progressPoints=[0,20,40,60], mu=20, sigma=0 → effectiveSigma=0.5
const REPORTS_INC = [mkRep(0, 21), mkRep(20, 14), mkRep(40, 7), mkRep(60, 0)];

// Three reports (minimum): progressPoints=[10,30,50], mu=20
const REPORTS_B = [mkRep(10, 14), mkRep(30, 7), mkRep(50, 0)];

// Stalled: same progress across 3 reports → mu=0, effectiveSigma floor=0.5
const REPORTS_STALLED = [mkRep(40, 21), mkRep(40, 14), mkRep(40, 7)];

// Declining via task-dilution: adding TASK2 (effectivePct=50, activityProgress=0)
// in the 3rd report dilutes the average. progressPoints=[80,80,20], mu=-30, sigma=30.
// TASK2 uses status:'In Progress' to force effectivePct=50 (status fallback for progress=0),
// which allows it to enter the cumulative merge from a "clean" prior state (no prior TASK2).
const REPORTS_DEC = [
  mkRep(80, 21),
  mkRep(80, 14),
  {
    workPackageStatuses: {
      rough_in: {
        [TASK]:  { progress: 80, status: 'Not Started' },   // effectivePct=80
        [TASK2]: { progress:  0, status: 'In Progress' },   // effectivePct=50, activityProg=0
      },
    },
    reportingDate: iso(now - 7 * DAY),
  },
];

const PROJECT        = { targetOpeningDate: iso(now + 90 * DAY) };
const PROJECT_NO_TOD = {};  // no targetOpeningDate

// ── A) Insufficient-data guards ───────────────────────────────────────────────
// These return immediately — no 10 000-sim loop runs.
// Note: the deltas.length===0 guard can ONLY fire when progressPoints.length<2,
// which is impossible when sortedReports.length≥3 (progressPoints.length=sortedReports.length).
// The ≥3 guard therefore makes deltas.length===0 unreachable in practice.
console.log('\nA) Insufficient-data guards');

check('A1: undefined sortedReports → insufficient_data',
  computeMonteCarloForecast(PROJECT, undefined).insufficient_data === true);

check('A2: 2 reports (< 3) → insufficient_data',
  computeMonteCarloForecast(PROJECT, [mkRep(20, 7), mkRep(40, 0)]).insufficient_data === true);

check('A3: no targetOpeningDate → insufficient_data',
  computeMonteCarloForecast(PROJECT_NO_TOD, REPORTS_INC).insufficient_data === true);

// 3 identical-progress reports: sigma=0 → effectiveSigma=0.5 (floor) — should NOT be
// insufficient (the engine still runs 10 000 sims with the sigma floor to keep sims moving).
{
  const r = computeMonteCarloForecast(PROJECT, REPORTS_STALLED);
  check('A4: 3 identical-progress reports → NOT insufficient_data', r.insufficient_data === false);
  check('A5: stalled (sigma=0 → sigma floor=0.5) → simulations=10000', r.simulations === 10000);
}

// ── B) Result structure ───────────────────────────────────────────────────────
// Uses REPORTS_B ([10,30,50], real randomness) to populate all fields.
console.log('\nB) Result structure invariants (real randomness)');
{
  const r = computeMonteCarloForecast(PROJECT, REPORTS_B);
  check('B1:  insufficient_data === false',          r.insufficient_data === false);
  check('B2:  simulations === 10000',                r.simulations       === 10000);
  check('B3:  currentProgress is number',            typeof r.currentProgress === 'number');
  check('B4:  targetOpeningDate is Date',            r.targetOpeningDate instanceof Date);
  check('B5:  p10 is Date',                          r.p10 instanceof Date);
  check('B6:  p50 is Date',                          r.p50 instanceof Date);
  check('B7:  p90 is Date',                          r.p90 instanceof Date);
  check('B8:  pOnTime is integer',                   Number.isInteger(r.pOnTime));
  check('B9:  pOnTime in [0,100]',                   r.pOnTime >= 0 && r.pOnTime <= 100);
  check('B10: highRisk is boolean',                  typeof r.highRisk === 'boolean');
  check('B11: cone.optimistic === p10',              r.cone?.optimistic === r.p10);
  check('B12: cone.median === p50',                  r.cone?.median     === r.p50);
  check('B13: cone.pessimistic === p90',             r.cone?.pessimistic === r.p90);
}

// ── C) Probability invariants (real randomness) ───────────────────────────────
// These hold for ANY seed because they follow from the algorithm's structure.
// Sum bound: each pct=round(n/N*100), four n-values sum to N exactly,
// so sum of n/N*100 = 100; independent rounding shifts each by ≤0.5 → sum ∈ [98,102].
console.log('\nC) Probability invariants — hold for any seed');
{
  const r = computeMonteCarloForecast(PROJECT, REPORTS_INC, null, { random: globalThis.Math.random });
  const psum = r.pOnTime + r.pDelay2Weeks + r.pDelayMonth + r.pDelayCritical;
  check('C1: pct-sum in [98,102]',               psum >= 98 && psum <= 102);
  check('C2: all four pcts in [0,100]',
    [r.pOnTime, r.pDelay2Weeks, r.pDelayMonth, r.pDelayCritical].every(p => p >= 0 && p <= 100));
  check('C3: p10 <= p50',                        r.p10 <= r.p50);
  check('C4: p50 <= p90',                        r.p50 <= r.p90);
  check('C5: highRisk === (pOnTime < 25)',        r.highRisk === (r.pOnTime < 25));
}

// ── D) Deterministic behavior via Math.random stub ───────────────────────────
// Restore the real Math.random after each sub-section.
console.log('\nD) Deterministic via Math.random stub');

// D1-D4: ZERO stub → randomNormal ≈ 0 → delta = mu every iteration
// With REPORTS_INC: mu=20, currentProgress=60, weeks=ceil((100-60)/20)=2
// p50 = today+14 days (all 10000 sims converge on exactly 2 weeks)
{
  const origRandom = Math.random;
  let c = 0;
  // Alternates [0.5, 0.25, 0.5, 0.25, ...]:
  //   Math.random() call 1 → 0.5  → u = 1-0.5  = 0.5
  //   Math.random() call 2 → 0.25 → v = 0.25
  //   randomNormal = sqrt(-2*log(0.5)) * cos(2π*0.25) = sqrt(1.386) * 0 ≈ 7e-17 ≈ 0
  globalThis.Math.random = () => (c++ % 2 === 0 ? 0.5 : 0.25);

  const r = computeMonteCarloForecast(PROJECT, REPORTS_INC, null, { random: globalThis.Math.random, asOf: now });

  globalThis.Math.random = origRandom;

  check('D1: zero stub → p50 is Date',          r.p50 instanceof Date);
  check('D2: zero stub → currentProgress=60',   r.currentProgress === 60);

  // p50 should be today + ceil((100-60)/20)*7 = today + 14 days, ±1 day tolerance
  // (engine uses its own `new Date()` internally, so 'now' may differ by <1s)
  const expected = new Date(now + 2 * 7 * DAY);
  check('D3: zero stub → p50 exactly asOf+14d', r.p50.getTime() === expected.getTime());

  check('D4: zero stub → cone.median === p50',  r.cone.median === r.p50);
}

// D5-D7: NEGATIVE stub → randomNormal ≈ -4.29 → delta≈-159 → clipped to 0 → MAX_WEEKS
// With REPORTS_DEC: mu=-30, sigma=30, currentProgress=20
// All 10 000 sims hit MAX_WEEKS=520 → p50 = today + 520*7 = today+3640 days
{
  const origRandom = Math.random;
  let c = 0;
  // Alternates [0.9999, 0.5, 0.9999, 0.5, ...]:
  //   u = 1-0.9999 = 0.0001
  //   v = 0.5
  //   randomNormal = sqrt(-2*log(0.0001)) * cos(π) = sqrt(18.42) * (-1) ≈ -4.29
  //   delta = -30 + 30*(-4.29) ≈ -159  →  max(0, delta) = 0  →  p stays at 20
  globalThis.Math.random = () => (c++ % 2 === 0 ? 0.9999 : 0.5);

  const r = computeMonteCarloForecast(PROJECT, REPORTS_DEC, null, { random: globalThis.Math.random, asOf: now });

  globalThis.Math.random = origRandom;

  const MAX_WEEKS = 520;
  const capDate   = now + MAX_WEEKS * 7 * DAY;

  check('D5: negative stub (all sims hit MAX_WEEKS) → p50 is Date', r.p50 instanceof Date);
  // p50 must be the cap date (today + 3640 days), with ±1 day for the engine's internal new Date()
  check('D6: negative stub → p50 exactly asOf+3640d', r.p50.getTime() === capDate);
  check('D7: negative stub → p10 === p50 (all sims identical)',    r.p10.getTime() === r.p50.getTime());
}

// ── E) Declining progress — structural checks (real randomness) ───────────────
// REPORTS_DEC has mu=-30, sigma=30. max(0, delta) prevents backward movement in each sim.
// With real randomness, forward progress still occurs whenever mu+sigma*N(0,1)>0
// (P(z > 1) ≈ 15.9%), so sims typically complete in ~32 weeks, NOT at MAX_WEEKS.
// This test verifies the engine handles a negative-mu project without hanging.
console.log('\nE) Declining progress — structural checks (real random)');
{
  const r = computeMonteCarloForecast(PROJECT, REPORTS_DEC);
  check('E1: declining mu → returns full result (not insufficient)',  r.insufficient_data === false);
  check('E2: declining mu → p50 is Date',                            r.p50 instanceof Date);
  check('E3: declining mu → pDelayCritical >= 0',                    r.pDelayCritical >= 0);
  check('E4: declining mu → pct sum reasonable',
    (r.pOnTime + r.pDelay2Weeks + r.pDelayMonth + r.pDelayCritical) >= 98);
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
