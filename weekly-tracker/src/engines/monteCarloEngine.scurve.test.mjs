// monteCarloEngine.scurve.test.mjs — S-curve deceleration (kDeceleration,
// computeMonteCarloForecast({ useSCurve: true })).
// Run: node src/engines/monteCarloEngine.scurve.test.mjs
//
// Uses the same Math.random ZERO-stub technique as
// src/tests/monteCarloEngine.test.mjs (randomNormal ≈ 0, so
// delta = mu + effectiveSigma*0 = mu every iteration — fully deterministic,
// no statistical/flakiness concerns).
//
// Fixture: progressPoints=[70,80,90] → mu=10, sigma=0, effectiveSigma=0.5
// (floor), currentProgress=90.
//   Linear:   step 1: p=90+10=100 → done.                     weeks=1
//   S-curve:  step 1: p=90, k(90)=0.6 (85<=p<95) → delta=6 → p=96
//             step 2: p=96, k(96)=0.4 (p>=95)    → delta=4 → p=100 → done
//                                                              weeks=2
// So with this fixture S-curve takes exactly one week longer than linear —
// hand-traceable, not just "on average across N sims".

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeMonteCarloForecast, kDeceleration } = await import('./monteCarloEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

const DAY = 86_400_000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

const TASK = 'Wall Marking & Setting Out';
const mkRep = (pct, daysAgo) => ({
  workPackageStatuses: { rough_in: { [TASK]: { progress: pct, status: 'Not Started' } } },
  reportingDate: iso(now - daysAgo * DAY),
});

// progressPoints=[70,80,90] → deltas=[10,10], mu=10, sigma=0, effectiveSigma=0.5
const REPORTS_HIGH = [mkRep(70, 14), mkRep(80, 7), mkRep(90, 0)];
const PROJECT = { targetOpeningDate: iso(now + 90 * DAY) };

// ── kDeceleration boundaries (0-100 scale — this codebase's progress scale
//    everywhere, not 0.0-1.0) ────────────────────────────────────────────────
console.log('\nkDeceleration boundaries');
check('k(0) === 1.0',   kDeceleration(0)   === 1.0);
check('k(59) === 1.0',  kDeceleration(59)  === 1.0);
check('k(60) === 0.8',  kDeceleration(60)  === 0.8);
check('k(84) === 0.8',  kDeceleration(84)  === 0.8);
check('k(85) === 0.6',  kDeceleration(85)  === 0.6);
check('k(94) === 0.6',  kDeceleration(94)  === 0.6);
check('k(95) === 0.4',  kDeceleration(95)  === 0.4);
check('k(100) === 0.4', kDeceleration(100) === 0.4);

// ── Backward compatibility: useSCurve defaults to false (linear, unchanged
//    behavior) when options is omitted entirely ─────────────────────────────
console.log('\nDefault behavior (no options arg)');
{
  const r = computeMonteCarloForecast(PROJECT, REPORTS_HIGH);
  check('no options → model is "linear"', r.model === 'linear');
}

// ── Deterministic linear vs s-curve comparison (Math.random ZERO-stub) ──────
console.log('\nLinear vs S-curve (deterministic, zero-stub)');
{
  const origRandom = Math.random;
  let c = 0;
  globalThis.Math.random = () => (c++ % 2 === 0 ? 0.5 : 0.25); // randomNormal ≈ 0

  const linear = computeMonteCarloForecast(PROJECT, REPORTS_HIGH, null, { useSCurve: false, random: globalThis.Math.random });
  c = 0;
  const scurve = computeMonteCarloForecast(PROJECT, REPORTS_HIGH, null, { useSCurve: true, random: globalThis.Math.random });

  globalThis.Math.random = origRandom;

  check('linear.model === "linear"',   linear.model === 'linear');
  check('scurve.model === "s-curve"',  scurve.model === 's-curve');
  check('linear.currentProgress === 90', linear.currentProgress === 90);

  const linearExpected = new Date(now + 1 * 7 * DAY);
  const scurveExpected = new Date(now + 2 * 7 * DAY);
  check('linear p50 ≈ today+7d (±1d)',
    Math.abs(linear.p50.getTime() - linearExpected.getTime()) <= DAY);
  check('scurve p50 ≈ today+14d (±1d)',
    Math.abs(scurve.p50.getTime() - scurveExpected.getTime()) <= DAY);

  // The core sanity check the feature exists for: S-curve must never finish
  // EARLIER than linear from the same historical deltas.
  check('scurve.p50 >= linear.p50', scurve.p50.getTime() >= linear.p50.getTime());
  check('scurve.p90 >= linear.p90', scurve.p90.getTime() >= linear.p90.getTime());
  check('scurve.p10 >= linear.p10', scurve.p10.getTime() >= linear.p10.getTime());

  check('mu present and equal in both',   linear.mu === scurve.mu && linear.mu === 10);
  check('sigma present and equal (floor)', linear.sigma === scurve.sigma);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
