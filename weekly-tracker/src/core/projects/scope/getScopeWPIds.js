/**
 * Derive the active work-package id list from a project scope object.
 *
 * v1 scope objects carry `scope.phases` (a phase-id filter matched against
 * wp.phaseId); v2 (zoned) scope objects carry `scope.zones` instead (a
 * zone-id filter — v2's flat WP list also uses `phaseId` to hold the zone id,
 * see retailFitoutV2.js's ALL_WORK_PACKAGES_V2, so the same `wp.phaseId`
 * match works for both without duplicating this function). A scope object
 * only ever has one or the other, never both, so this is purely additive
 * for v1 — `scope.phases` still wins whenever it's present.
 *
 * @param {object|null|undefined} scope  — project.scope (phases|zones, workPackages, weightOverrides)
 * @param {Array<{id:string, phaseId:string}>} workPackages — master WP list to filter against
 * @returns {string[]|null}  — filtered WP ids, or null when scope is absent (= full scope)
 */
export function getScopeWPIds(scope, workPackages) {
  if (!scope) return null;
  const groupFilter = scope.phases?.length ? scope.phases : (scope.zones?.length ? scope.zones : null);
  return workPackages
    .filter(wp => (!groupFilter                || groupFilter.includes(wp.phaseId))
               && (!scope.workPackages?.length || scope.workPackages.includes(wp.id)))
    .map(wp => wp.id);
}
