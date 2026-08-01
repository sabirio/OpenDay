/**
 * Pure Master Catalog (schemaVersion 2) progress-weight formulas — Slice
 * 5E-R's "responsive category effort" model. Core supplies the flattened
 * template + scope inputs; this engine owns the math, mirroring
 * zonedWeightsEngine.js's role for schemaVersion 1.
 */

/**
 * calibratedEffort(wp) = categoryFactor(category(wp)) x baseEffort(wp)
 * resolvedWeight(wp)   = groupShare(group(wp)) x calibratedEffort(wp)
 *                        / sum(calibratedEffort over eligible+selected WPs in the SAME group)
 *
 * Deliberately two effective layers only (Group -> calibrated WP effort) —
 * the Slice 5E-R algebraic simplification proved a separately-normalized
 * "category share" layer is redundant once categoryFactor is folded
 * directly into each WP's calibrated effort; it is not implemented here.
 * Category contributes only categoryFactor (metadata), never a separate
 * budget WP shares are carved from.
 *
 * Empty branches (a category or a whole group with zero eligible+selected
 * WPs) are dropped and the survivors renormalize proportionally to their
 * own precomputed baseline share — no ghost weight at any level.
 *
 * @param {Array<{id: string, zoneId: string, phaseId: string, categoryFactor?: number, baseEffort?: number, constructionProgressEligible: boolean}>} workPackages — flattened catalog WPs
 * @param {string[]|null} scopeWPIds
 * @param {Record<string, number>} groupShares — precomputed baseline group (zone) shares, 0-100 scale, from computeZoneWeights()
 * @returns {{ effectiveWeights: Record<string, number>, phaseWeights: Record<string, number> }}
 */
export function computeMasterCatalogEffectiveWeights(workPackages, scopeWPIds, groupShares) {
  const selectedSet = new Set(scopeWPIds ?? []);
  const eligibleSelected = workPackages.filter(wp => selectedSet.has(wp.id) && wp.constructionProgressEligible === true);

  const byGroup = new Map();
  for (const wp of eligibleSelected) {
    if (!byGroup.has(wp.zoneId)) byGroup.set(wp.zoneId, []);
    byGroup.get(wp.zoneId).push(wp);
  }
  const activeGroupIds = [...byGroup.keys()];

  const baselineShares = groupShares ?? {};
  const survivingTotal = activeGroupIds.reduce((sum, id) => sum + (baselineShares[id] ?? 0), 0);

  const effectiveWeights = {};
  const phaseWeights = {};
  for (const groupId of activeGroupIds) {
    const groupShare = survivingTotal > 0 ? (baselineShares[groupId] ?? 0) / survivingTotal : 0;
    const groupWPs = byGroup.get(groupId);
    const calibrated = groupWPs.map(wp => ({ wp, effort: (wp.categoryFactor ?? 0) * (wp.baseEffort ?? 0) }));
    const totalCalibrated = calibrated.reduce((sum, entry) => sum + entry.effort, 0);

    for (const { wp, effort } of calibrated) {
      const resolvedWeight = totalCalibrated > 0 ? groupShare * (effort / totalCalibrated) : 0;
      effectiveWeights[wp.id] = resolvedWeight;
      phaseWeights[wp.phaseId] = (phaseWeights[wp.phaseId] ?? 0) + resolvedWeight;
    }
  }

  return { effectiveWeights, phaseWeights };
}
