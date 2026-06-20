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

  // Per-phase weight: use template progressWeight if provided, else fall back to equal weighting.
  // Normalised across only the phases present in scope so the result always sums to 1.
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
    const pctSum = phaseWPs.reduce((s, wp) => s + (wp.duration_pct || 0), 0);
    const pw = phaseWeightOf(phaseId);
    for (const wp of phaseWPs) {
      const normPct = pctSum > 0 ? wp.duration_pct / pctSum : 1 / phaseWPs.length;
      result[wp.id] = pw * normPct;
    }
  }

  return result;
}
