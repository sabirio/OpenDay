// normalizeWeightsTo100.test.mjs — architecture-conformance pin.
// Run: node src/core/projects/weights/normalizeWeightsTo100.test.mjs
//
// Extracted verbatim from ProjectScopeConfigurator.jsx's local
// normalizeWeights()/activeTotal calculation (F3, calc-in-presentation
// audit). Values below were captured from the pre-refactor component logic
// before the move — this test proves the extraction is byte-identical, not
// a logic change.
//
// Zero-dependency: no imports beyond the module under test.

import {
  normalizeWeightsTo100,
  sumWeights,
  sumPhaseProgressWeights,
  sumDurationPct,
  isWithinEpsilon,
  pctOfTotal,
  WEIGHT_SUM_TARGET,
} from './normalizeWeightsTo100.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\nsumWeights');
{
  check('sums numeric weights over the given ids only',
    sumWeights(['a', 'b'], { a: 10, b: 20, c: 999 }) === 30);
  check('treats missing weight as 0', sumWeights(['a', 'z'], { a: 5 }) === 5);
  check('treats non-numeric weight as 0', sumWeights(['a', 'b'], { a: 30, b: 'abc' }) === 30);
  check('empty id list -> 0', sumWeights([], { a: 10 }) === 0);
}

console.log('\nnormalizeWeightsTo100 — pinned against pre-refactor ProjectScopeConfigurator.normalizeWeights()');
{
  check('proportional split with zero rounding drift (10,20,5 -> sum 100 already)',
    JSON.stringify(normalizeWeightsTo100(['a', 'b', 'c'], { a: 10, b: 20, c: 5 })) ===
    JSON.stringify({ a: 29, b: 57, c: 14 }));

  check('equal raw weights with positive rounding drift goes to the first max index (1,1,1 -> 34,33,33)',
    JSON.stringify(normalizeWeightsTo100(['a', 'b', 'c'], { a: 1, b: 1, c: 1 })) ===
    JSON.stringify({ a: 34, b: 33, c: 33 }));

  check('all-zero weights split evenly, no remainder (0,0 across 2 ids -> 50,50)',
    JSON.stringify(normalizeWeightsTo100(['a', 'b'], { a: 0, b: 0 })) ===
    JSON.stringify({ a: 50, b: 50 }));

  check('all-zero (missing) weights across 3 ids, remainder to the first id (-> 34,33,33)',
    JSON.stringify(normalizeWeightsTo100(['a', 'b', 'c'], {})) ===
    JSON.stringify({ a: 34, b: 33, c: 33 }));

  check('non-numeric weight treated as 0 during proportional split (30,"abc" -> 100,0)',
    JSON.stringify(normalizeWeightsTo100(['a', 'b'], { a: '30', b: 'abc' })) ===
    JSON.stringify({ a: 100, b: 0 }));

  check('empty id list -> empty object, no throw', JSON.stringify(normalizeWeightsTo100([], { a: 10 })) === '{}');

  // Every non-empty case must land on exactly 100 — the whole point of the
  // largest-remainder drift correction.
  for (const [label, ids, weights] of [
    ['3 uneven', ['a', 'b', 'c'], { a: 10, b: 20, c: 5 }],
    ['3 equal',  ['a', 'b', 'c'], { a: 1, b: 1, c: 1 }],
    ['2 zero',   ['a', 'b'],      { a: 0, b: 0 }],
  ]) {
    const result = normalizeWeightsTo100(ids, weights);
    const total  = Object.values(result).reduce((s, w) => s + w, 0);
    check(`${label}: normalized weights always sum to exactly 100`, total === 100);
  }
}

console.log('\nsumPhaseProgressWeights');
{
  check('sums progressWeight across phases',
    sumPhaseProgressWeights([{ progressWeight: 40 }, { progressWeight: 60 }]) === 100);
  check('treats missing progressWeight as 0',
    sumPhaseProgressWeights([{ progressWeight: 40 }, {}]) === 40);
  check('empty list -> 0', sumPhaseProgressWeights([]) === 0);
}

console.log('\nsumDurationPct');
{
  check('sums duration_pct across work packages',
    sumDurationPct([{ duration_pct: 0.5 }, { duration_pct: 0.5 }]) === 1);
  check('treats missing duration_pct as 0',
    sumDurationPct([{ duration_pct: 0.3 }, {}]) === 0.3);
  check('empty list -> 0', sumDurationPct([]) === 0);
}

console.log('\nisWithinEpsilon');
{
  check('exact match -> true', isWithinEpsilon(100, 100) === true);
  check('within default epsilon (0.001) -> true', isWithinEpsilon(100.0005, 100) === true);
  check('outside default epsilon -> false', isWithinEpsilon(100.5, 100) === false);
  check('custom epsilon widens the tolerance', isWithinEpsilon(101, 100, 1.5) === true);
}

console.log('\npctOfTotal');
{
  check('40/100 -> 40%', pctOfTotal(40, 100) === 40);
  check('1/3 -> 33.33...% (unrounded)', Math.abs(pctOfTotal(1, 3) - 33.333333333333336) < 1e-9);
  check('zero total -> 0 (guarded, no NaN/Infinity)', pctOfTotal(5, 0) === 0);
}

console.log('\nWEIGHT_SUM_TARGET');
{
  check('is 100', WEIGHT_SUM_TARGET === 100);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
