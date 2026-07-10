/**
 * explainProgress — pure attribution reconstructor.
 *
 * Does NOT recompute progress. Given pre-computed effectiveWeights and per-WP
 * progress values, it explains what each WP contributed to the overall %.
 *
 * @param {object} effectiveWeights  — { wpId: weight }, weights sum to ~1
 * @param {object} taskProgress      — { wpId: 0-100 }
 * @param {Array}  workPackages      — [{ id, phaseId, label }] for output enrichment
 * @param {Array}  phases            — [{ id, label|name }] for byPhase ordering
 * @param {number|null} officialTotal — authoritative % from progressEngine (for drift check)
 *
 * @returns {{
 *   total: number,
 *   officialTotal: number|null,
 *   drift: number|null,
 *   denominator: number,
 *   lines: Array,
 *   byPhase: Array,
 *   excluded: Array,
 * }}
 */
export function explainProgress({
  effectiveWeights = {},
  taskProgress = {},
  workPackages = [],
  phases = [],
  officialTotal = null,
}) {
  // wpId → { phaseId, label } lookup from the provided workPackages list
  const wpMeta = {};
  for (const wp of workPackages) {
    wpMeta[wp.id] = { phaseId: wp.phaseId ?? null, label: wp.label ?? wp.id };
  }

  const inScope = new Set(Object.keys(effectiveWeights));

  // One line per in-scope WP
  const lines = [];
  for (const [wpId, weight] of Object.entries(effectiveWeights)) {
    const progress = taskProgress[wpId] ?? 0;
    const contribution = weight * progress;
    const meta = wpMeta[wpId] ?? { phaseId: null, label: wpId };
    lines.push({ wpId, phaseId: meta.phaseId, label: meta.label, weight, progress, contribution });
  }
  lines.sort((a, b) => b.contribution - a.contribution);

  const total      = lines.reduce((s, l) => s + l.contribution, 0);
  const denominator = lines.reduce((s, l) => s + l.weight, 0);
  const drift      = officialTotal != null ? +(total - officialTotal).toFixed(4) : null;

  // byPhase — accumulate per phase bucket, then emit in phases[] order
  const byPhaseMap = {};
  for (const line of lines) {
    const pid = line.phaseId ?? '__unknown__';
    if (!byPhaseMap[pid]) byPhaseMap[pid] = { contribution: 0, weight: 0 };
    byPhaseMap[pid].contribution += line.contribution;
    byPhaseMap[pid].weight       += line.weight;
  }

  const byPhase = [];
  const seen = new Set();
  for (const phase of phases) {
    const bucket = byPhaseMap[phase.id];
    if (!bucket) continue;
    byPhase.push({
      phaseId:       phase.id,
      label:         phase.label ?? phase.name ?? phase.id,
      phaseProgress: bucket.weight > 0 ? bucket.contribution / bucket.weight : 0,
      contribution:  bucket.contribution,
      weight:        bucket.weight,
    });
    seen.add(phase.id);
  }
  // Append any phases not covered by phases[] (unknown phaseId on WPs)
  for (const [pid, bucket] of Object.entries(byPhaseMap)) {
    if (seen.has(pid)) continue;
    byPhase.push({
      phaseId:       pid,
      label:         pid,
      phaseProgress: bucket.weight > 0 ? bucket.contribution / bucket.weight : 0,
      contribution:  bucket.contribution,
      weight:        bucket.weight,
    });
  }

  // Excluded — WPs present in workPackages but absent from effectiveWeights (out of scope)
  const excluded = workPackages
    .filter(wp => !inScope.has(wp.id))
    .map(wp => ({ wpId: wp.id, phaseId: wp.phaseId ?? null, label: wp.label ?? wp.id, reason: 'NOT_IN_SCOPE' }));

  return { total, officialTotal, drift, denominator, lines, byPhase, excluded };
}

/** Below this magnitude (pp), a total/officialTotal drift is not worth flagging in the UI. */
export const EXPLAIN_DRIFT_THRESHOLD_PP = 0.5;

/**
 * Whether a computed drift is large enough to surface in the WhyPanel —
 * ProgressNarrative.jsx's `drift != null && Math.abs(drift) > 0.5` check.
 * @param {number|null} drift
 */
export function isExplainDriftSignificant(drift) {
  return drift != null && Math.abs(drift) > EXPLAIN_DRIFT_THRESHOLD_PP;
}
