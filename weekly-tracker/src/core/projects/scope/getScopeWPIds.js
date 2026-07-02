/**
 * Derive the active work-package id list from a project scope object.
 *
 * @param {object|null|undefined} scope  — project.scope (phases, workPackages, weightOverrides)
 * @param {Array<{id:string, phaseId:string}>} workPackages — master WP list to filter against
 * @returns {string[]|null}  — filtered WP ids, or null when scope is absent (= full scope)
 */
export function getScopeWPIds(scope, workPackages) {
  if (!scope) return null;
  return workPackages
    .filter(wp => (!scope.phases?.length      || scope.phases.includes(wp.phaseId))
               && (!scope.workPackages?.length || scope.workPackages.includes(wp.id)))
    .map(wp => wp.id);
}
