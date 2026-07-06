import { normalizeWeightsTo100 } from './normalizeWeightsTo100.js';

/**
 * Computes each active zone's final weight (summing to 100), for the zoned
 * retail fit-out v2 template.
 *
 * Fixed-weight zones ('common') always contribute their configured
 * fixedWeight when active. The remaining budget (100 - sum of active fixed
 * weights) is split across active area-weighted zones proportionally to
 * their floor area (areas[zoneId], m²), reusing normalizeWeightsTo100 to do
 * the proportional-split + largest-remainder rounding, then rescaling that
 * 0-100 split down to the actual remaining budget. When no area zone has a
 * usable (numeric, >0) m² value yet, area zones fall back to their own
 * defaultWeight ratio instead of an equal split — defaultWeight values are
 * defined to already sum to the remaining budget (e.g. 45 + 20 = 65), so a
 * project with no areas entered yet still gets the template's intended
 * default proportions, not an arbitrary 50/50.
 *
 * A final drift correction (against the *actual* rescaled decimal values,
 * not just the intermediate 0-100 split) guarantees the grand total across
 * every active zone is always exactly 100, even after per-zone rounding to
 * one decimal place.
 *
 * @param {{zones: Array<{id:string, weightMode:'fixed'|'area', fixedWeight?:number, defaultWeight?:number}>}} template
 * @param {Record<string, number>} [areas] — { zoneId → m² }, only meaningful for 'area' zones
 * @param {string[]|null} [activeZoneIds] — null = every zone in the template is active
 * @returns {Record<string, number>} { zoneId → weight }, summing to exactly 100 over active zones
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
  const hasUsableArea = areaIds.some(id => Number(areas[id]) > 0);

  const rawWeights = {};
  for (const z of areaZones) {
    rawWeights[z.id] = hasUsableArea ? (Number(areas[z.id]) || 0) : (z.defaultWeight ?? 0);
  }

  // Proportional split on a 0-100 scale, then rescale to the actual remaining budget.
  const splitTo100 = normalizeWeightsTo100(areaIds, rawWeights);
  for (const id of areaIds) {
    result[id] = Math.round((splitTo100[id] / 100) * remaining * 10) / 10;
  }

  // The rescale-and-round-to-1dp step above can itself introduce drift
  // (splitTo100 sums to exactly 100, but 100/100*remaining rescaled and
  // independently rounded per zone doesn't always sum to exactly
  // `remaining`) — correct it against the largest area zone so the grand
  // total across all active zones is always exactly 100.
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
 * Computes the fully-resolved effective weight of every in-scope work
 * package across every active zone, on the same 0-100 scale as
 * computeZoneWeights: zoneWeight% × categoryShare% × wpDurationPct.
 *
 *   zoneWeight    — from computeZoneWeights() (0-100, per zone)
 *   categoryShare — each active category's `weight` within its zone,
 *                   re-normalized to 100 via normalizeWeightsTo100 so
 *                   dropping a category redistributes its share to the
 *                   others still in scope (0-100, per category)
 *   wpDurationPct — the work package's own share within its category
 *                   (0-1 fraction, from CATEGORY_LIBRARY) — used directly,
 *                   not re-normalized, so excluding a WP via scopeWPIds
 *                   narrows that category's total rather than inflating
 *                   its remaining WPs.
 *
 * With every zone/category/WP in scope, every category's durationPct
 * values sum to 1 and every zone's category shares sum to 100, so the
 * result sums to exactly 100 across all returned WPs.
 *
 * @param {{zones: Array<{id:string, weightMode:'fixed'|'area', fixedWeight?:number, defaultWeight?:number, categories: Array<{id:string, weight:number}>}>}} template
 * @param {Record<string, {label:string, workPackages: Array<{id:string, label:string, durationPct:number, isBlocker:boolean}>}>} categoryLibrary
 * @param {{areas?: Record<string,number>, activeZoneIds?: string[]|null, scopeWPIds?: string[]|null, activeCategoryIds?: string[]|null}} [options]
 * @returns {Record<string, number>} { wpId → effective weight }, 0-100 scale
 */
export function computeZonedEffectiveWeights(template, categoryLibrary, options = {}) {
  const { areas = {}, activeZoneIds = null, scopeWPIds = null, activeCategoryIds = null } = options;

  const zoneWeights = computeZoneWeights(template, areas, activeZoneIds);
  const result = {};

  for (const zone of template.zones) {
    const zoneWeight = zoneWeights[zone.id];
    if (zoneWeight == null) continue; // zone excluded by activeZoneIds

    const zoneCategories = zone.categories.filter(c => !activeCategoryIds || activeCategoryIds.includes(c.id));
    if (zoneCategories.length === 0) continue;

    const catIds = zoneCategories.map(c => c.id);
    const catWeights = Object.fromEntries(zoneCategories.map(c => [c.id, c.weight]));
    const categoryShares = normalizeWeightsTo100(catIds, catWeights);

    for (const cat of zoneCategories) {
      const share = categoryShares[cat.id] ?? 0;
      const wps = (categoryLibrary[cat.id]?.workPackages ?? [])
        .filter(wp => !scopeWPIds || scopeWPIds.includes(wp.id));
      for (const wp of wps) {
        result[wp.id] = Math.round(zoneWeight * (share / 100) * wp.durationPct * 1000) / 1000;
      }
    }
  }

  return result;
}
