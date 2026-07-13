import { normalizeWeightsTo100 } from './templateWeightsEngine.js';

/**
 * Pure zoned retail fit-out v2 weighting formulas. Core supplies the template
 * and scope inputs; this engine owns the math.
 */

export function computeZoneWeights(template, areas = {}, activeZoneIds = null) {
  const zones = template.zones.filter(z => !activeZoneIds || activeZoneIds.includes(z.id));
  if (zones.length === 0) return {};

  const fixedZones = zones.filter(z => z.weightMode === 'fixed');
  const areaZones  = zones.filter(z => z.weightMode === 'area');

  const result = {};
  let fixedTotal = 0;
  for (const z of fixedZones) {
    const w = z.fixedWeight ?? 0;
    result[z.id] = w;
    fixedTotal += w;
  }

  if (areaZones.length === 0) return result;

  const remaining = Math.max(0, 100 - fixedTotal);
  const areaIds   = areaZones.map(z => z.id);
  const normalizedAreas = Object.fromEntries(areaIds.map(id => {
    const value = Number(areas[id]);
    return [id, Number.isFinite(value) && value > 0 ? value : 0];
  }));
  const hasUsableArea = areaIds.some(id => normalizedAreas[id] > 0);

  const rawWeights = {};
  for (const z of areaZones) {
    rawWeights[z.id] = hasUsableArea ? normalizedAreas[z.id] : (z.defaultWeight ?? 0);
  }

  const splitTo100 = normalizeWeightsTo100(areaIds, rawWeights);
  for (const id of areaIds) {
    result[id] = Math.round((splitTo100[id] / 100) * remaining * 10) / 10;
  }

  const grandTotal = Object.values(result).reduce((s, w) => s + w, 0);
  const drift = Math.round((100 - grandTotal) * 10) / 10;
  if (drift !== 0) {
    let maxId = areaIds[0];
    for (const id of areaIds) if (result[id] > result[maxId]) maxId = id;
    result[maxId] = Math.round((result[maxId] + drift) * 10) / 10;
  }

  return result;
}

/**
 * A v2 category's synthetic-phase progressWeight — zoneWeight% x categoryShare%,
 * rounded to 3 decimals. Single source for buildV2ProgressTemplate.js, which
 * previously inlined this exact formula instead of delegating to this engine.
 */
export function computeCategoryProgressWeight(zoneWeight, share) {
  return Math.round(zoneWeight * (share / 100) * 1000) / 1000;
}

export function computeZoneCategoryShares(zone, activeCategoryIds = null) {
  const zoneCategories = zone.categories.filter(c => !activeCategoryIds || activeCategoryIds.includes(c.id));
  if (zoneCategories.length === 0) return [];

  const catIds = zoneCategories.map(c => c.id);
  const catWeights = Object.fromEntries(zoneCategories.map(c => [c.id, c.weight]));
  const categoryShares = normalizeWeightsTo100(catIds, catWeights);

  return zoneCategories.map(category => ({ category, share: categoryShares[category.id] ?? 0 }));
}

export function computeZonedEffectiveWeights(template, categoryLibrary, options = {}) {
  const { areas = {}, activeZoneIds = null, scopeWPIds = null, activeCategoryIds = null } = options;

  const zoneWeights = computeZoneWeights(template, areas, activeZoneIds);
  const result = {};

  for (const zone of template.zones) {
    const zoneWeight = zoneWeights[zone.id];
    if (zoneWeight == null) continue;

    for (const { category: cat, share } of computeZoneCategoryShares(zone, activeCategoryIds)) {
      const wps = (categoryLibrary[cat.id]?.workPackages ?? [])
        .filter(wp => !scopeWPIds || scopeWPIds.includes(wp.id));
      for (const wp of wps) {
        result[wp.id] = Math.round(zoneWeight * (share / 100) * wp.durationPct * 1000) / 1000;
      }
    }
  }

  return result;
}
