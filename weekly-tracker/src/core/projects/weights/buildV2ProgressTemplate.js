import { computeZoneWeights, computeZoneCategoryShares, computeCategoryProgressWeight } from './computeZoneWeights.js';
import { retailFitoutV2, CATEGORY_LIBRARY } from '../../../domains/construction/templates/retailFitoutV2.js';

/**
 * Converts the zoned v2 template + a project's zone areas into the exact
 * `{ workPackages, phases }` shape progressEngine.js's calculateProjectProgress/
 * calculateProjectProgressResult already accept as a custom `template` param
 * (see resolveTemplate() in progressEngine.js) — this is the ONLY integration
 * point needed to make the existing progress engine work for v2 projects.
 * No changes to progressEngine.js itself.
 *
 * Each v2 CATEGORY becomes one synthetic "phase" (progressEngine's atomic
 * weighting unit): phase.progressWeight = zoneWeight% x categoryShare%
 * (categoryShare re-normalized to 100 across in-scope categories in that
 * zone, same as computeZonedEffectiveWeights). Each WP's phaseId is set to
 * its category id (not its zone id) — so a v2 project's persisted
 * workPackageStatuses must be keyed by category id at the top level
 * (contractorReportAdapter.js/ContractorReport.jsx's v2 submit path builds
 * it that way — see buildV2WorkPackageStatuses in contractorReportAdapter.js).
 *
 * @param {Record<string, number>} [zoneAreas] — project.scope.zoneAreas, e.g. { sales: 700, boh: 300 }
 * @param {string[]|null} [activeZoneIds] — null = every zone active (project.scope.zones)
 * @param {string[]|null} [activeCategoryIds] — null = every category active (project.scope.categories)
 * @returns {{ workPackages: Array<{id:string,label:string,phaseId:string,duration_pct:number}>, phases: Array<{id:string,label:string,progressWeight:number,order:number}> }}
 */
export function buildV2ProgressTemplate(zoneAreas = {}, activeZoneIds = null, activeCategoryIds = null) {
  const zoneWeights = computeZoneWeights(retailFitoutV2, zoneAreas, activeZoneIds);
  const phases = [];
  const workPackages = [];
  let order = 1;

  for (const zone of retailFitoutV2.zones) {
    const zoneWeight = zoneWeights[zone.id];
    if (zoneWeight == null) continue; // zone excluded by activeZoneIds

    for (const { category: cat, share } of computeZoneCategoryShares(zone, activeCategoryIds)) {
      const progressWeight = computeCategoryProgressWeight(zoneWeight, share);
      const lib = CATEGORY_LIBRARY[cat.id];

      phases.push({ id: cat.id, label: lib?.label ?? cat.id, progressWeight, order: order++ });

      for (const wp of (lib?.workPackages ?? [])) {
        workPackages.push({ id: wp.id, label: wp.label, phaseId: cat.id, duration_pct: wp.durationPct });
      }
    }
  }

  return { workPackages, phases };
}
