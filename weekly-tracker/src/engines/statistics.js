/**
 * statistics — the ONE neutral statistics utility for small-N historical
 * cohorts/groups. Extracted from engines/benchmarkEngine.js (its original
 * and only owner) so Cost Intelligence Engine can become a second consumer
 * without depending on Benchmark Engine itself:
 *
 *              statistics.js
 *               /          \
 *       benchmarkEngine   costIntelligenceEngine
 *
 * The algorithm is byte-for-byte unchanged from the prior benchmarkEngine.js
 * implementation — this is a move, not a rewrite. One deterministic
 * percentile algorithm: linear interpolation between ranks (a.k.a.
 * "PERCENTILE.INC"). No outlier trimming, no winsorizing.
 */

/** Linear-interpolation percentile (0-100) over an already-sorted array. */
export function percentileOf(sortedValues, p) {
  const n = sortedValues.length;
  if (n === 1) return sortedValues[0];
  const index = (p / 100) * (n - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * weight;
}

/**
 * sampleSize/min/max/mean/median/p25/p75 over a numeric array. Median is the
 * primary analytical center; mean is returned for transparency only.
 * @param {number[]} values
 */
export function computeStatistics(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    sampleSize: n,
    min: sorted[0],
    max: sorted[n - 1],
    mean: sum / n,
    median: percentileOf(sorted, 50),
    p25: percentileOf(sorted, 25),
    p75: percentileOf(sorted, 75),
  };
}
