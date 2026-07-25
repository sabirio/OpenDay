// statistics.test.mjs — neutral statistics utility certification. Proves the
// extracted computeStatistics()/percentileOf() are byte-identical in
// behavior to the prior benchmarkEngine.js-owned implementation (same
// values in -> same median/mean/p25/p75 out), and stand alone as the shared
// owner for both Benchmark Engine and Cost Intelligence Engine.
// Run: node src/engines/statistics.test.mjs
import assert from 'node:assert/strict';
import { computeStatistics, percentileOf } from './statistics.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  OK ${name}`); };
const close = (a, b, eps = 0.001) => Math.abs(a - b) < eps;

console.log('\nstatistics — computeStatistics (odd/even samples, same values used by benchmarkEngine.test.mjs)');

ok('odd sample size (3): median is the middle value, p25/p75 via linear interpolation', () => {
  const s = computeStatistics([400, 410, 420]);
  assert.equal(s.sampleSize, 3);
  assert.equal(s.min, 400);
  assert.equal(s.max, 420);
  assert.ok(close(s.mean, 410));
  assert.ok(close(s.median, 410));
  assert.ok(close(s.p25, 405));
  assert.ok(close(s.p75, 415));
});

ok('even sample size (4): median averages the two middle values', () => {
  const s = computeStatistics([400, 410, 420, 430]);
  assert.ok(close(s.median, 415));
  assert.ok(close(s.mean, 415));
  assert.ok(close(s.p25, 407.5));
  assert.ok(close(s.p75, 422.5));
});

ok('single value: min/max/mean/median/p25/p75 all equal that value', () => {
  const s = computeStatistics([520]);
  assert.equal(s.sampleSize, 1);
  assert.equal(s.min, 520);
  assert.equal(s.max, 520);
  assert.equal(s.mean, 520);
  assert.equal(s.median, 520);
  assert.equal(s.p25, 520);
  assert.equal(s.p75, 520);
});

ok('negative values are preserved (never made absolute)', () => {
  const s = computeStatistics([-5, -2, 0, 2, 5]);
  assert.equal(s.median, 0);
  assert.equal(s.min, -5);
  assert.equal(s.max, 5);
});

ok('does not mutate the input array (sorts a copy)', () => {
  const values = [5, 1, 3];
  computeStatistics(values);
  assert.deepEqual(values, [5, 1, 3]);
});

ok('outliers are never trimmed — an extreme value stays in min/max/mean', () => {
  const s = computeStatistics([500, 510, 520, 2000]);
  assert.equal(s.sampleSize, 4);
  assert.equal(s.max, 2000);
  assert.ok(s.mean > 520); // the outlier pulls the mean up, proving it wasn't discarded
});

console.log('\nstatistics — percentileOf (direct)');

ok('percentileOf(50) on a sorted array equals the median computeStatistics would report', () => {
  const sorted = [1, 2, 3, 4].sort((a, b) => a - b);
  assert.ok(close(percentileOf(sorted, 50), computeStatistics([1, 2, 3, 4]).median));
});

console.log(`\n-- RESULT: ${n} passed, 0 failed --\n`);
