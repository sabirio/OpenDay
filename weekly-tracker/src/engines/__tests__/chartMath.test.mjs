// chartMath.test.mjs — unit tests for the generic chart/gauge/sparkline math.
// Run: node src/engines/__tests__/chartMath.test.mjs
// No extensionless imports here — chartMath.js has zero dependencies.

import {
  computeGaugeArc,
  computeSparkRange,
  valueToSparkY,
  clamp,
  fractionToWidth,
  fractionToPercent,
  ratioToPercent,
  percentToWidth,
  minOf,
  maxOf,
  roundPct,
} from '../chartMath.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

// ── computeGaugeArc ─────────────────────────────────────────────────────────
console.log('\n1) computeGaugeArc');
{
  const { circumference, dash } = computeGaugeArc(50, 100, 45);
  check('circumference = 2*PI*45', Math.abs(circumference - 2 * Math.PI * 45) < 1e-9);
  check('dash = half circumference at score=50/100', Math.abs(dash - circumference / 2) < 1e-9);
  check('dash = 0 at score 0', computeGaugeArc(0, 100, 45).dash === 0);
  check('dash = full circumference at score=max', Math.abs(computeGaugeArc(100, 100, 45).dash - computeGaugeArc(100, 100, 45).circumference) < 1e-9);
}

// ── computeSparkRange ────────────────────────────────────────────────────────
console.log('\n2) computeSparkRange');
{
  const r1 = computeSparkRange([0.9, 1.1, 0.7], 0.5, 1.5);
  check('min respects floor when values are above it', r1.min === 0.5);
  check('max respects floor when values are below it', r1.max === 1.5);
  check('range = max - min', r1.range === 1);

  const r2 = computeSparkRange([0.2, 2.0], 0.5, 1.5);
  check('min widens below floor when a value is lower', r2.min === 0.2);
  check('max widens above floor when a value is higher', r2.max === 2.0);

  const r3 = computeSparkRange([1.0], 1.0, 1.0);
  check('range never 0 (falls back to 1)', r3.range === 1);
}

// ── valueToSparkY ────────────────────────────────────────────────────────────
console.log('\n3) valueToSparkY');
{
  check('value=min -> y=height (bottom)', valueToSparkY(0, 0, 100, 40) === 40);
  check('value=min+range -> y=0 (top)', valueToSparkY(100, 0, 100, 40) === 0);
  check('value=midpoint -> y=height/2', valueToSparkY(50, 0, 100, 40) === 20);
}

// ── clamp ─────────────────────────────────────────────────────────────────────
console.log('\n4) clamp');
{
  check('clamp below min -> min', clamp(-5, 0, 1) === 0);
  check('clamp above max -> max', clamp(5, 0, 1) === 1);
  check('clamp inside range -> unchanged', clamp(0.5, 0, 1) === 0.5);
}

// ── fractionToWidth / fractionToPercent ───────────────────────────────────────
console.log('\n5) fractionToWidth / fractionToPercent');
{
  check('fractionToWidth(0.5, 64) = 32', fractionToWidth(0.5, 64) === 32);
  check('fractionToWidth rounds', fractionToWidth(0.501, 100) === 50);
  check('fractionToPercent(0.5) = 50', fractionToPercent(0.5) === 50);
  check('fractionToPercent(1) = 100', fractionToPercent(1) === 100);
}

// ── ratioToPercent ────────────────────────────────────────────────────────────
console.log('\n6) ratioToPercent');
{
  check('ratioToPercent(10, 20) = 50', ratioToPercent(10, 20) === 50);
  check('ratioToPercent rounds', ratioToPercent(1, 3) === 33);
  check('ratioToPercent(0, 20) = 0', ratioToPercent(0, 20) === 0);
}

// ── percentToWidth ────────────────────────────────────────────────────────────
console.log('\n7) percentToWidth');
{
  check('percentToWidth(50, 200) = 100', percentToWidth(50, 200) === 100);
  check('percentToWidth(0, 200) = 0', percentToWidth(0, 200) === 0);
  check('percentToWidth unrounded (33.5, 100)', percentToWidth(33.5, 100) === 33.5);
  check('percentToWidth negative pct stays negative (no clamp)', percentToWidth(-10, 100) === -10);
}

// ── minOf / maxOf ───────────────────────────────────────────────────────────────
console.log('\n8) minOf / maxOf');
{
  check('minOf([5, 1, 3]) = 1', minOf([5, 1, 3]) === 1);
  check('maxOf([5, 1, 3]) = 5', maxOf([5, 1, 3]) === 5);
  check('minOf single-element list', minOf([7]) === 7);
}

// ── roundPct ──────────────────────────────────────────────────────────────────
console.log('\n9) roundPct');
{
  check('roundPct(49.6) = 50', roundPct(49.6) === 50);
  check('roundPct(49.4) = 49', roundPct(49.4) === 49);
  check('roundPct(0) = 0', roundPct(0) === 0);
  check('roundPct(-1.5) rounds toward +Infinity (Math.round semantics)', roundPct(-1.5) === -1);
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
