import { computeZoneWeights } from '../../../engines/zonedWeightsEngine.js';
import { resolveV2TemplateData } from '../../../domains/construction/templates/versionedScopeTemplate.js';

/**
 * Converts a schemaVersion 2 (Master Catalog) template + a project's zone
 * areas into the same `{ workPackages, phases }` shape buildV2ProgressTemplate.js
 * produces for schemaVersion 1 — the ONLY integration point progressEngine.js
 * needs, so no change to calculatePhaseProgress()'s own math is required.
 *
 * Unlike buildV2ProgressTemplate.js, `phase.progressWeight` is deliberately
 * NOT set here. For the Master Catalog weight model (Slice 5E-R's
 * "responsive category effort" model) a category's true contribution
 * depends on exactly which WPs are selected — unlike v1, where phase weight
 * is scope-independent (a category with 1-of-5 WPs selected gets the same
 * phase weight as one with 5-of-5). Baking a static progressWeight here
 * would silently reintroduce the "fixed category budget" pathology Slice
 * 5E-R rejected. The canonical resolveProjectProgressWeights() resolver
 * (called from inside progressEngine.js, once scopeWPIds is known) computes
 * both the per-WP effectiveWeights and the per-category phaseWeights
 * aggregate together, at the same time — see resolveProjectProgressWeights.js.
 *
 * Group (Project-Wide/Sales/BOH) shares ARE computed here, once, by reusing
 * computeZoneWeights() UNCHANGED — the same canonical area engine v1
 * already uses. Group share only depends on project area facts and the
 * template's own areaBasis/anchorPct/defaultWeight metadata (translated
 * below into computeZoneWeights()'s existing weightMode/fixedWeight/
 * defaultWeight contract — no new area logic, just an adapter), never on
 * which specific WPs end up selected within a group. The one exception — a
 * group ending up with ZERO eligible+selected WPs — is handled later,
 * inside the resolver, by renormalizing these baseline shares over the
 * surviving groups (cheap: at most 3 numbers, no need to re-invoke this
 * function or re-touch area facts).
 *
 * @param {Record<string, number>} [zoneAreas] — effective inputs from resolveEffectiveV2ZoneAreas() (same {sales, boh} shape v1 already uses)
 * @param {object|null} [projectOrTemplate]
 * @returns {{ workPackages: Array<object>, phases: Array<{id:string,label:string}>, schemaVersion: number, groupShares: Record<string, number>, rawData: object }}
 */
export function buildMasterCatalogProgressTemplate(zoneAreas = {}, projectOrTemplate = null) {
  const data = resolveV2TemplateData(projectOrTemplate);

  // Adapter: translate the Master Catalog's own areaBasis/anchorPct/
  // defaultWeight vocabulary into computeZoneWeights()'s existing
  // weightMode/fixedWeight/defaultWeight contract — a read-only, local
  // object, never mutating the template's own data.
  const adaptedZones = (data.zones ?? []).map(zone => ({
    id: zone.id,
    weightMode: zone.areaBasis === 'NONE' ? 'fixed' : 'area',
    fixedWeight: zone.areaBasis === 'NONE' ? zone.anchorPct : undefined,
    defaultWeight: zone.areaBasis === 'NONE' ? undefined : zone.defaultWeight,
  }));
  const groupShares = computeZoneWeights({ zones: adaptedZones }, zoneAreas, null);

  const workPackages = [];
  const phases = [];
  for (const zone of (data.zones ?? [])) {
    for (const category of (zone.categories ?? [])) {
      phases.push({ id: category.id, label: category.label ?? category.id });
      for (const wp of (category.workPackages ?? [])) {
        workPackages.push({
          ...wp,
          phaseId: category.id,
          categoryId: category.id,
          zoneId: zone.id,
          categoryFactor: category.categoryFactor,
          constructionProgressEligible: wp.constructionProgressEligible === true,
        });
      }
    }
  }

  return { workPackages, phases, schemaVersion: data.schemaVersion, groupShares, rawData: data };
}
