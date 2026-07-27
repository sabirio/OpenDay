// costEvidencePolicy.test.mjs — the shared positive-actual-cost analytical
// policy, extracted from engines/benchmarkEngine.js. Proves the predicate
// behaves identically to the inline checks it replaced, and stands alone as
// the shared owner for both Benchmark Engine and Cost Intelligence Engine.
// Run: node src/engines/costEvidencePolicy.test.mjs
import assert from 'node:assert/strict';
import { isUsableActualCostEvidence } from './costEvidencePolicy.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  OK ${name}`); };

console.log('\ncostEvidencePolicy — isUsableActualCostEvidence');

ok('a positive actualCost is usable evidence', () => {
  assert.equal(isUsableActualCostEvidence({ financial: { actualCost: 500000 } }), true);
});

ok('actualCost = 0 (a real, factual zero — "unknown != zero") is NOT usable cost-per-area evidence', () => {
  assert.equal(isUsableActualCostEvidence({ financial: { actualCost: 0 } }), false);
});

ok('a negative actualCost is not usable evidence', () => {
  assert.equal(isUsableActualCostEvidence({ financial: { actualCost: -100 } }), false);
});

ok('a missing actualCost (null) is not usable evidence', () => {
  assert.equal(isUsableActualCostEvidence({ financial: { actualCost: null } }), false);
});

ok('a missing financial block entirely does not throw and is not usable evidence', () => {
  assert.equal(isUsableActualCostEvidence({}), false);
  assert.equal(isUsableActualCostEvidence(null), false);
  assert.equal(isUsableActualCostEvidence(undefined), false);
});

ok('a non-numeric actualCost (defensive) is not usable evidence', () => {
  assert.equal(isUsableActualCostEvidence({ financial: { actualCost: '500000' } }), false);
  assert.equal(isUsableActualCostEvidence({ financial: { actualCost: NaN } }), false);
});

console.log(`\n-- RESULT: ${n} passed, 0 failed --\n`);
