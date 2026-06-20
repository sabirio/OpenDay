export function computeEffectiveWeights(workPackages, scopeWPIds = null) {
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
  const phaseWeight = 1 / phaseIds.length;
  const result = {};

  for (const phaseId of phaseIds) {
    const phaseWPs = byPhase[phaseId];
    const pctSum = phaseWPs.reduce((s, wp) => s + (wp.duration_pct || 0), 0);
    for (const wp of phaseWPs) {
      const normPct = pctSum > 0 ? wp.duration_pct / pctSum : 1 / phaseWPs.length;
      result[wp.id] = phaseWeight * normPct;
    }
  }

  return result;
}
