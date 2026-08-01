import { MASTER_CATALOG_SCHEMA_VERSION } from '../../../domains/construction/templates/versionedScopeTemplate.js';
import { buildV2ProgressTemplate } from './buildV2ProgressTemplate.js';
import { buildMasterCatalogProgressTemplate } from './buildMasterCatalogProgressTemplate.js';

/**
 * ONE canonical, schema-aware progress-TEMPLATE resolver (Slice 5E.1A) —
 * the single place "which template shape do I build" is decided, so
 * business/use-case consumers (evaluateProjectState, contractorEngine,
 * buildContractorReportSubmission, weeklyReportReviewModel) never branch on
 * schemaVersion themselves merely to construct the correct progress
 * template. Mirrors resolveProjectScopeSelection()'s (getScopeWPIds.js) own
 * "one canonical resolver, no scattered version checks" precedent —
 * consumers still resolve/pass ordinary facts (scopeTemplate, zone areas,
 * zone/category scope), they just no longer decide the FORMULA/SHAPE.
 *
 * schemaVersion 1 (legacy zoned) / unversioned: buildV2ProgressTemplate(),
 * byte-identical, unchanged.
 * schemaVersion 2 (Master Catalog): buildMasterCatalogProgressTemplate() —
 * `activeZoneIds`/`activeCategoryIds` are deliberately ignored here (the
 * Master Catalog contract has no zone/category-level sub-selection, only
 * WP-level scope — see versionedScopeTemplate.js).
 *
 * @param {object} args
 * @param {object|null} args.scopeTemplate — resolveProjectScopeTemplate() output (or an equivalent {data} record)
 * @param {Record<string, number>} [args.zoneAreas] — resolveEffectiveV2ZoneAreas() output
 * @param {string[]|null} [args.activeZoneIds] — schemaVersion 1 only (project.scope.zones)
 * @param {string[]|null} [args.activeCategoryIds] — schemaVersion 1 only (project.scope.categories)
 * @returns {{ workPackages: Array<object>, phases: Array<object>, schemaVersion?: number }}
 */
export function resolveProjectProgressTemplate({ scopeTemplate, zoneAreas = {}, activeZoneIds = null, activeCategoryIds = null }) {
  const schemaVersion = scopeTemplate?.data?.schemaVersion;
  return schemaVersion === MASTER_CATALOG_SCHEMA_VERSION
    ? buildMasterCatalogProgressTemplate(zoneAreas, scopeTemplate)
    : buildV2ProgressTemplate(zoneAreas, activeZoneIds, activeCategoryIds, scopeTemplate);
}
