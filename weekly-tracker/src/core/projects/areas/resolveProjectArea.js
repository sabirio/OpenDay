import {
  MASTER_CATALOG_SCHEMA_VERSION,
  getDefaultScopeWorkPackageIds,
} from '../../../domains/construction/templates/versionedScopeTemplate.js';

export const PROJECT_AREA_BASIS = Object.freeze({
  TOTAL_AREA: 'TOTAL_AREA',
  SALES_AREA: 'SALES_AREA',
  BOH_AREA: 'BOH_AREA',
  NONE: 'NONE',
});

const AREA_FIELDS = Object.freeze({
  [PROJECT_AREA_BASIS.TOTAL_AREA]: ['storeSizeSqm', 'store_size_sqm'],
  [PROJECT_AREA_BASIS.SALES_AREA]: ['salesAreaSqm', 'sales_area_sqm'],
  [PROJECT_AREA_BASIS.BOH_AREA]: ['backOfHouseAreaSqm', 'back_of_house_area_sqm'],
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key);
}

function normalizeCanonicalArea(value) {
  if (value === '' || value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function readCanonicalArea(project, fieldNames) {
  for (const fieldName of fieldNames) {
    if (hasOwn(project, fieldName)) return normalizeCanonicalArea(project[fieldName]);
  }
  return null;
}

/**
 * Resolve one canonical project-area fact. NONE is deliberately represented
 * as null ("not area based"), never as numeric zero.
 */
export function resolveProjectArea(project, areaBasis) {
  if (areaBasis === PROJECT_AREA_BASIS.NONE) return null;
  const fields = AREA_FIELDS[areaBasis];
  if (!fields) throw new Error(`Unsupported project area basis: ${areaBasis}`);
  return readCanonicalArea(project ?? {}, fields);
}

/**
 * Existing v2 projects that explicitly persisted scope.zoneAreas retain that
 * historical input. New canonical-area projects are distinguished by its
 * absence and never receive a synthetic/version-like marker.
 */
export function getLegacyV2ZoneAreas(project, fallbackLegacyZoneAreas = null) {
  const scope = project?.scope;
  if (scope && hasOwn(scope, 'zoneAreas') && scope.zoneAreas && typeof scope.zoneAreas === 'object' && !Array.isArray(scope.zoneAreas)) {
    return scope.zoneAreas;
  }
  if (fallbackLegacyZoneAreas && typeof fallbackLegacyZoneAreas === 'object' && !Array.isArray(fallbackLegacyZoneAreas)) {
    return fallbackLegacyZoneAreas;
  }
  return null;
}

export function resolveProjectAreaContext(project, { fallbackLegacyZoneAreas = null } = {}) {
  const totalArea = resolveProjectArea(project, PROJECT_AREA_BASIS.TOTAL_AREA);
  const canonicalSalesArea = resolveProjectArea(project, PROJECT_AREA_BASIS.SALES_AREA);
  const canonicalBohArea = resolveProjectArea(project, PROJECT_AREA_BASIS.BOH_AREA);
  const legacyZoneAreas = getLegacyV2ZoneAreas(project, fallbackLegacyZoneAreas);

  if (legacyZoneAreas) {
    return {
      source: 'legacy-scope',
      totalArea,
      salesArea: normalizeCanonicalArea(legacyZoneAreas.sales),
      bohArea: normalizeCanonicalArea(legacyZoneAreas.boh),
      zoneAreas: { ...legacyZoneAreas },
    };
  }

  return {
    source: 'canonical-project',
    totalArea,
    salesArea: canonicalSalesArea,
    bohArea: canonicalBohArea,
    zoneAreas: {
      ...(canonicalSalesArea == null ? {} : { sales: canonicalSalesArea }),
      ...(canonicalBohArea == null ? {} : { boh: canonicalBohArea }),
    },
  };
}

export function resolveEffectiveV2ZoneAreas(project, options) {
  return resolveProjectAreaContext(project, options).zoneAreas;
}

/**
 * Apply a scope selection without allowing UI code to decide whether
 * historical zoneAreas must survive.
 */
export function mergeProjectScopeSelection(project, selection) {
  const next = selection && typeof selection === 'object' ? { ...selection } : {};
  delete next.zoneAreas;
  const legacyZoneAreas = getLegacyV2ZoneAreas(project);
  if (legacyZoneAreas) next.zoneAreas = { ...legacyZoneAreas };
  return Object.keys(next).length > 0 ? next : null;
}

export function clearProjectScopeSelection(project) {
  const legacyZoneAreas = getLegacyV2ZoneAreas(project);
  return legacyZoneAreas ? { zoneAreas: { ...legacyZoneAreas } } : null;
}

/**
 * Schema-aware "Reset to Default" (Slice 5C Phase 11). For schemaVersion 1
 * this is byte-for-byte the existing clearProjectScopeSelection() behavior —
 * unchanged, resets to `null` (= the full pinned template). For schemaVersion
 * 2, "default" is never "full catalog": it resets to an explicit selection
 * materialized from the template's own canonical
 * defaultScope.workPackageIds, matching how a new schema-v2 project is
 * already initialized (newProjectScopeOrchestration.js). "Clear All" (an
 * explicit empty selection) and "Select All" (the full catalog), if ever
 * exposed, are deliberately separate operations from this one — this
 * function only ever restores the template's defined default.
 */
export function resolveResetProjectScopeSelection(project, template) {
  const isMasterCatalog = template?.data?.schemaVersion === MASTER_CATALOG_SCHEMA_VERSION;
  if (!isMasterCatalog) return clearProjectScopeSelection(project);

  const legacyZoneAreas = getLegacyV2ZoneAreas(project);
  return {
    ...(legacyZoneAreas ? { zoneAreas: { ...legacyZoneAreas } } : {}),
    workPackages: getDefaultScopeWorkPackageIds(template.data),
  };
}
