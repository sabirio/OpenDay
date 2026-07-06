/**
 * Sum of raw weights for a given ordered list of ids, treating any
 * missing/non-numeric weight as 0. Shared by normalizeWeightsTo100() below and
 * ProjectScopeConfigurator.jsx's "Σ x/100" validity check, so both read the
 * exact same number instead of each re-summing independently.
 *
 * @param {string[]} orderedIds
 * @param {Record<string, number|string>} weights — { id → raw weight }
 * @returns {number}
 */
export function sumWeights(orderedIds, weights) {
  return orderedIds.reduce((s, id) => s + (Number(weights[id]) || 0), 0);
}

/**
 * Normalizes a set of raw weights (keyed by id) to sum to exactly 100, using
 * largest-remainder-style rounding: each weight is scaled proportionally and
 * rounded, then any rounding drift (100 - sum of rounded values) is applied
 * entirely to whichever id ended up with the largest rounded weight.
 *
 * If every raw weight is 0 (or none are numeric), splits 100 as evenly as
 * possible across all ids instead (the remainder goes to the first `extra` ids).
 *
 * @param {string[]} orderedIds — ids to normalize, in a stable order (drift/
 *   remainder assignment depends on this order matching the caller's display order)
 * @param {Record<string, number|string>} weights — { id → raw weight }
 * @returns {Record<string, number>} { id → normalized weight }, summing to exactly 100
 */
export function normalizeWeightsTo100(orderedIds, weights) {
  if (orderedIds.length === 0) return {};

  const sum = sumWeights(orderedIds, weights);
  let rounded;
  if (sum === 0) {
    const base  = Math.floor(100 / orderedIds.length);
    const extra = 100 - base * orderedIds.length;
    rounded = orderedIds.map((_, i) => i < extra ? base + 1 : base);
  } else {
    rounded = orderedIds.map(id => Math.round((Number(weights[id]) || 0) / sum * 100));
  }

  const drift  = 100 - rounded.reduce((s, w) => s + w, 0);
  const maxIdx = rounded.reduce((best, w, i) => w > rounded[best] ? i : best, 0);
  rounded[maxIdx] += drift;

  const result = {};
  orderedIds.forEach((id, i) => { result[id] = rounded[i]; });
  return result;
}
