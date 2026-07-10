// discrepancyClassify.test.mjs — unit tests for AD-005 canonical functions
// Run: node src/engines/__tests__/discrepancyClassify.test.mjs

import {
  discrepancySeverity,
  classifyDiscrepancy,
  countDiscrepanciesByStatus,
  countDiscrepanciesBySignedDelta,
  countConfirmed,
  progressGapPp,
} from '../../engines/discrepancyEngine.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

// ── A) discrepancySeverity boundaries ────────────────────────────────────────

console.log('\nA) discrepancySeverity');

check('A1: 0 → ok',        discrepancySeverity(0)   === 'ok');
check('A2: 9 → ok',        discrepancySeverity(9)   === 'ok');
check('A3: 10 → warning',  discrepancySeverity(10)  === 'warning');
check('A4: 25 → warning',  discrepancySeverity(25)  === 'warning');
check('A5: 26 → critical', discrepancySeverity(26)  === 'critical');
check('A6: null → ok',     discrepancySeverity(null) === 'ok');
// Negative delta: absolute value used
check('A7: -10 → warning', discrepancySeverity(-10) === 'warning');
check('A8: -26 → critical',discrepancySeverity(-26) === 'critical');

// ── B) classifyDiscrepancy — rank-based paths ─────────────────────────────────

console.log('\nB) classifyDiscrepancy — rank paths');

// B1: equal rank, small delta → match
check('B1: equal rank, |delta|<=5 → match',
  classifyDiscrepancy({ pmRank: 1, gcRank: 1, delta: 3 }).type === 'match');

// B2: equal rank, |delta| = 5 boundary (inclusive) → match
check('B2: equal rank, |delta|=5 → match',
  classifyDiscrepancy({ pmRank: 1, gcRank: 1, delta: 5 }).type === 'match');

// B3: equal rank, delta = -5 boundary → match
check('B3: equal rank, delta=-5 → match',
  classifyDiscrepancy({ pmRank: 1, gcRank: 1, delta: -5 }).type === 'match');

// B4: equal rank, delta > 5 → pm-higher
check('B4: equal rank, delta=6 → pm-higher',
  classifyDiscrepancy({ pmRank: 1, gcRank: 1, delta: 6 }).type === 'pm-higher');

// B5: equal rank, delta < -5 → discrepancy
check('B5: equal rank, delta=-6 → discrepancy',
  classifyDiscrepancy({ pmRank: 1, gcRank: 1, delta: -6 }).type === 'discrepancy');

// B6: pmRank < gcRank → discrepancy regardless of delta
check('B6: pm behind gc → discrepancy',
  classifyDiscrepancy({ pmRank: 0, gcRank: 1, delta: 0 }).type === 'discrepancy');

// B7: pmRank > gcRank → pm-higher (delta zero)
check('B7: pm ahead rank, delta=0 → pm-higher',
  classifyDiscrepancy({ pmRank: 2, gcRank: 1, delta: 0 }).type === 'pm-higher');

// B8: pmRank > gcRank but delta < -5 → discrepancy (GC claims higher %)
check('B8: pm ahead rank but delta=-10 → discrepancy',
  classifyDiscrepancy({ pmRank: 2, gcRank: 1, delta: -10 }).type === 'discrepancy');

// ── C) classifyDiscrepancy — no-rank paths ────────────────────────────────────

console.log('\nC) classifyDiscrepancy — no-rank paths');

check('C1: no ranks, delta=0 → match',
  classifyDiscrepancy({ delta: 0 }).type === 'match');

check('C2: no ranks, delta=5 → match',
  classifyDiscrepancy({ delta: 5 }).type === 'match');

check('C3: no ranks, delta=-5 → match',
  classifyDiscrepancy({ delta: -5 }).type === 'match');

check('C4: no ranks, delta=6 → pm-higher',
  classifyDiscrepancy({ delta: 6 }).type === 'pm-higher');

check('C5: no ranks, delta=-6 → discrepancy',
  classifyDiscrepancy({ delta: -6 }).type === 'discrepancy');

// ── D) classifyDiscrepancy — severity attached ────────────────────────────────

console.log('\nD) classifyDiscrepancy — severity field');

check('D1: delta=30 → critical severity',
  classifyDiscrepancy({ delta: 30 }).severity === 'critical');

check('D2: delta=-30 → critical severity',
  classifyDiscrepancy({ delta: -30 }).severity === 'critical');

check('D3: delta=15 → warning severity',
  classifyDiscrepancy({ delta: 15 }).severity === 'warning');

check('D4: delta=3 → ok severity',
  classifyDiscrepancy({ delta: 3 }).severity === 'ok');

// ── E) Tolerance boundary — key behavior change from portfolioEngine ──────────

console.log('\nE) Tolerance boundary (behaviour change from portfolioEngine)');

// Old portfolioEngine: delta < 0 → discrepancy; new: delta < -5 → discrepancy
// So delta in (-5, 0) exclusive now resolves to 'match', not 'discrepancy'.
check('E1: delta=-1 (was discrepancy, now match)',
  classifyDiscrepancy({ pmRank: 1, gcRank: 1, delta: -1 }).type === 'match');

check('E2: delta=-4 (was discrepancy, now match)',
  classifyDiscrepancy({ pmRank: 1, gcRank: 1, delta: -4 }).type === 'match');

check('E3: delta=-5 (boundary) → still match',
  classifyDiscrepancy({ pmRank: 1, gcRank: 1, delta: -5 }).type === 'match');

check('E4: delta=-6 → discrepancy (over boundary)',
  classifyDiscrepancy({ pmRank: 1, gcRank: 1, delta: -6 }).type === 'discrepancy');

console.log('\nF) countDiscrepanciesByStatus');
{
  const discs = [{ status: 'critical' }, { status: 'warning' }, { status: 'critical' }, { status: 'ok' }];
  const counts = countDiscrepanciesByStatus(discs);
  check('critical count', counts.critical === 2);
  check('warning count', counts.warning === 1);
  check('empty list -> zeros', countDiscrepanciesByStatus([]).critical === 0 && countDiscrepanciesByStatus([]).warning === 0);
}

console.log('\nG) countDiscrepanciesBySignedDelta');
{
  const discs = [{ signedDelta: -12 }, { signedDelta: 8 }, { signedDelta: -3 }, { signedDelta: 0 }];
  const { overstated, pmAhead } = countDiscrepanciesBySignedDelta(discs);
  check('overstated counts negative signedDelta', overstated === 2);
  check('pmAhead counts positive signedDelta', pmAhead === 1);
  check('zero signedDelta counted in neither', overstated + pmAhead === 3);
  check('empty list -> zeros', countDiscrepanciesBySignedDelta([]).overstated === 0 && countDiscrepanciesBySignedDelta([]).pmAhead === 0);
}

console.log('\nH) countConfirmed');
{
  check('total minus flagged', countConfirmed(10, 3) === 7);
  check('flagged exceeds total -> floors at 0, never negative', countConfirmed(2, 5) === 0);
  check('no flagged -> all confirmed', countConfirmed(4, 0) === 4);
}

console.log('\nI) progressGapPp');
{
  check('a > b -> positive gap', progressGapPp(80, 50) === 30);
  check('a < b -> same magnitude regardless of order', progressGapPp(50, 80) === 30);
  check('equal values -> 0', progressGapPp(40, 40) === 0);
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
