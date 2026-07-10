/**
 * Pure template-weight formulas. This is the engine-layer source of truth for
 * scope weight normalization and effective WP weights; core may orchestrate it,
 * but should not duplicate these formulas.
 */

/** Target a template's phase progressWeights must sum to. */
export const WEIGHT_SUM_TARGET = 100;

export function sumWeights(orderedIds, weights) {
  return orderedIds.reduce((s, id) => s + (Number(weights[id]) || 0), 0);
}

/** Sum of a phase list's progressWeight — single source for the same
 * reduce() independently reimplemented by templateValidationEngine,
 * templateEditor.js and buildWeightAuditModel.js. */
export function sumPhaseProgressWeights(phases) {
  return phases.reduce((s, p) => s + (p.progressWeight || 0), 0);
}

/** Sum of a work-package list's duration_pct — single source for the same
 * reduce() independently reimplemented by templateValidationEngine,
 * computeEffectiveWeights (below) and buildWeightAuditModel.js. */
export function sumDurationPct(wps) {
  return wps.reduce((s, wp) => s + (wp.duration_pct || 0), 0);
}

/** Whether `value` is within `epsilon` of `target` — the tolerance check used
 * by every "does this weight sum add up" validation/display in the app. */
export function isWithinEpsilon(value, target, epsilon = 0.001) {
  return Math.abs(value - target) <= epsilon;
}

/** value/total as an unrounded percent, zero-guarded against total <= 0. */
export function pctOfTotal(value, total) {
  return total > 0 ? (value / total) * 100 : 0;
}

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

export function computeEffectiveWeights(workPackages, scopeWPIds = null, phaseWeights = null) {
  const wps = scopeWPIds
    ? workPackages.filter(wp => scopeWPIds.includes(wp.id))
    : workPackages;

  if (wps.length === 0) return {};

  const byPhase = {};
  for (const wp of wps) {
    if (!byPhase[wp.phaseId]) byPhase[wp.phaseId] = [];
    byPhase[wp.phaseId].push(wp);
  }

  const phaseIds = Object.keys(byPhase);

  let phaseWeightOf;
  if (phaseWeights) {
    const totalPW = phaseIds.reduce((s, id) => s + (phaseWeights[id] || 0), 0);
    phaseWeightOf = (id) => totalPW > 0 ? (phaseWeights[id] || 0) / totalPW : 1 / phaseIds.length;
  } else {
    phaseWeightOf = () => 1 / phaseIds.length;
  }

  const result = {};
  for (const phaseId of phaseIds) {
    const phaseWPs = byPhase[phaseId];
    const pctSum = sumDurationPct(phaseWPs);
    const pw = phaseWeightOf(phaseId);
    for (const wp of phaseWPs) {
      const normPct = pctSum > 0 ? wp.duration_pct / pctSum : 1 / phaseWPs.length;
      result[wp.id] = pw * normPct;
    }
  }

  return result;
}
