import { MASTER_CATALOG_SCHEMA_VERSION } from '../../../domains/construction/templates/versionedScopeTemplate.js';

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

/**
 * One canonical, schema-version-aware project scope-selection resolver
 * (Slice 5C Phase 4/17) — the single place that owns "what does null/empty/
 * explicit scope mean," so consumers (engines, Gantt, reports) never need
 * their own `if (schemaVersion === 2)` branch.
 *
 * schemaVersion !== 2 (including 1, legacy/unversioned, and no template at
 * all): delegates to getScopeWPIds() UNCHANGED — zero reinterpretation of
 * certified schema-v1 behavior. `null`/absent scope still means "full
 * template"; an empty `scope.workPackages` array still means the same.
 *
 * schemaVersion === 2: explicit-only semantics, no truthiness shortcuts.
 * `scope.workPackages` is read literally: a real array (including an empty
 * one) is the exact selection; anything else (null/undefined scope, or a
 * scope with no workPackages array — a state normal v2 project
 * initialization/reset never produces, see newProjectScopeOrchestration.js)
 * resolves to zero selected, never to the full catalog. Ids not present in
 * the supplied workPackages catalog are silently dropped (defensive
 * filtering, matching getScopeWPIds' own convention), never inflated.
 *
 * @param {object} args
 * @param {object|null|undefined} args.scope — project.scope
 * @param {Array<{id:string}>} args.workPackages — the resolved template's own catalog WP list
 * @param {number|null|undefined} args.schemaVersion — the resolved template's data.schemaVersion
 * @returns {string[]|null} — array of selected ids for schema v2 (never null); v1/legacy return unchanged (array or null = full scope)
 */
export function resolveProjectScopeSelection({ scope, workPackages, schemaVersion }) {
  if (schemaVersion !== MASTER_CATALOG_SCHEMA_VERSION) {
    return getScopeWPIds(scope, workPackages);
  }
  const explicitIds = Array.isArray(scope?.workPackages) ? scope.workPackages : [];
  const knownIds = new Set(workPackages.map(wp => wp.id));
  return explicitIds.filter(id => knownIds.has(id));
}
