import {
  ALL_WORK_PACKAGES_V2,
  CATEGORY_LIBRARY,
  retailFitoutV2,
  V2_TEMPLATE_TYPE,
} from './retailFitoutV2.js';
import { DEPENDENCY_RULES_V2 } from '../../../config/dependencyRulesV2.js';
import {
  MASTER_CATALOG_DEFAULT_SCOPE_WORK_PACKAGE_IDS,
  MASTER_CATALOG_GROUPS,
} from './retailFitoutMasterCatalog.js';

export const SCOPE_TEMPLATE_SCHEMA_VERSION = 1;
// Slice 5C — Master Catalog contract foundation. schemaVersion 2 is a
// distinct, explicit contract for comprehensive-catalog templates (Catalog +
// Default Scope + applicability/classification metadata) — NOT a silent
// extension of schemaVersion 1's semantics. See config/TEMPLATE_MODEL.md's
// "Master Catalog contract foundation — schemaVersion 2" section.
export const MASTER_CATALOG_SCHEMA_VERSION = 2;
export const ZONED_SCOPE_MODEL = 'zoned';
export const RETAIL_FITOUT_V2_FAMILY = V2_TEMPLATE_TYPE;
export const RETAIL_FITOUT_V2_FAMILY_ID = '8fd1ec34-81b7-4e2f-aafd-ae8d610f77f8';
export const RETAIL_FITOUT_V2_TEMPLATE_ID = 'dc92175a-251c-45ab-a4fd-c83c1c668ef4';
export const RETAIL_FITOUT_V2_WP_ID_SHA256 = 'fcf008a091073fb8741d8e2641bfd7b8bf2e5b51043a9b6bf0fb8c1714144566';

export const RETAIL_FITOUT_V2_SCHEDULE = Object.freeze({
  completionMarkerWpId: 'common.commissioning.integrated_systems_test',
  openingMarkerWpId: 'common.handover.keys_possession',
});

function clone(value) {
  return value == null ? value : structuredClone(value);
}

/**
 * Deterministically converts the certified static Retail Fit-Out V2 model
 * into the application-level JSON contract persisted in templates.data.
 * Static V2 remains only the bootstrap definition and the explicit
 * compatibility source for historical unpinned projects.
 */
export function materializeRetailFitoutV2TemplateData() {
  return {
    schemaVersion: SCOPE_TEMPLATE_SCHEMA_VERSION,
    model: ZONED_SCOPE_MODEL,
    templateType: V2_TEMPLATE_TYPE,
    label: retailFitoutV2.label,
    zones: retailFitoutV2.zones.map(zone => ({
      ...clone(zone),
      categories: zone.categories.map(category => ({
        ...clone(category),
        label: CATEGORY_LIBRARY[category.id]?.label ?? category.id,
        workPackages: clone(CATEGORY_LIBRARY[category.id]?.workPackages ?? []),
      })),
    })),
    dependencies: DEPENDENCY_RULES_V2.map(rule => ({
      from: rule.from,
      to: rule.to,
      type: rule.type,
      lagDays: rule.lag_days,
    })),
    schedule: clone(RETAIL_FITOUT_V2_SCHEDULE),
    identity: {
      workPackageCount: ALL_WORK_PACKAGES_V2.length,
      workPackageIdSha256: RETAIL_FITOUT_V2_WP_ID_SHA256,
    },
  };
}

// Slice 5D — the approved 221-WP Master Catalog candidate. SAME family/
// family_id lineage as v1 (`RETAIL_FITOUT_V2_FAMILY`/`RETAIL_FITOUT_V2_FAMILY_ID`)
// — this is the next VERSION of the existing retail-fitout-v2 family, not a
// new family. `RETAIL_FITOUT_MASTER_CATALOG_VERSION` is the DATABASE
// templates.version (2) — a separate axis from `MASTER_CATALOG_SCHEMA_VERSION`
// (data.schemaVersion, also 2 for this candidate, by coincidence of numbering
// only). This candidate is materialized as `is_active: false` at the
// migration layer (042/043) — never switched to the active/default template
// in this slice.
export const RETAIL_FITOUT_MASTER_CATALOG_TEMPLATE_ID = 'e4ef4d98-5688-4d12-9fca-2d7cded88d29';
export const RETAIL_FITOUT_MASTER_CATALOG_VERSION = 2;
export const RETAIL_FITOUT_MASTER_CATALOG_LABEL = 'Retail Fit-Out (Master Catalog)';

// Frozen certification fingerprints (Slice 5D Phase 13) — recomputed and
// asserted unchanged by masterCatalogContent.test.mjs. Same method as
// RETAIL_FITOUT_V2_WP_ID_SHA256: SHA-256 of the newline-joined ordered id
// list. SEMANTIC covers only fields this slice actually defines (schemaVersion,
// zone/category id+label, WP id+label+catalogClass, explicit defaultScope) —
// deliberately excludes weights/durations/dependencies/blockers/readiness/
// schedule markers/applicabilityTags, none of which are set in this slice.
export const RETAIL_FITOUT_MASTER_CATALOG_WP_ID_SHA256 =
  'f83c160a1bb8eb9a86b6c8ebd77a4e00adb84b4978113c0f7b01333f59c66082';
export const RETAIL_FITOUT_MASTER_CATALOG_DEFAULT_SCOPE_SHA256 =
  '0be78bc9f59052a2d1d6f1549a19320f8eeef44b2e837f26c06462dc7fbbecc0';
export const RETAIL_FITOUT_MASTER_CATALOG_SEMANTIC_SHA256 =
  '542bf262694c8cc345be3dd1606af512eb92af7b42e730512d65191fb9243fc4';

/**
 * Deterministic materializer for the approved 221-WP Master Catalog
 * candidate, mirroring materializeRetailFitoutV2TemplateData()'s role for
 * v1. Deliberately OMITS weightMode/fixedWeight (zones), durationPct (work
 * packages), and any blocker/readiness/schedule-marker metadata — none of
 * that has been designed/approved yet (Slice 5D scope boundary), and there
 * is no neutral non-semantic placeholder for those fields that wouldn't
 * silently imply calculation semantics. `dependencies: []` IS the approved
 * neutral placeholder for "not yet designed" at the template-data level
 * (schema-valid, structurally required as an array, semantically empty).
 * `applicabilityTags` is likewise omitted everywhere (not yet approved).
 */
export function materializeRetailFitoutMasterCatalogTemplateData() {
  return {
    schemaVersion: MASTER_CATALOG_SCHEMA_VERSION,
    model: ZONED_SCOPE_MODEL,
    templateType: V2_TEMPLATE_TYPE,
    label: RETAIL_FITOUT_MASTER_CATALOG_LABEL,
    zones: clone(MASTER_CATALOG_GROUPS),
    dependencies: [],
    defaultScope: { workPackageIds: [...MASTER_CATALOG_DEFAULT_SCOPE_WORK_PACKAGE_IDS] },
  };
}

export function isVersionedV2TemplateData(data) {
  return Boolean(
    data
    && data.schemaVersion === SCOPE_TEMPLATE_SCHEMA_VERSION
    && data.model === ZONED_SCOPE_MODEL
    && data.templateType === V2_TEMPLATE_TYPE
    && Array.isArray(data.zones)
    && Array.isArray(data.dependencies)
  );
}

/**
 * Shared physical-shape check (Slice 5C): schemaVersion 1 and schemaVersion 2
 * templates use the identical zones -> categories -> workPackages layout —
 * only schemaVersion 2 additionally requires `defaultScope`. Structural
 * extraction helpers (getScopeTemplateWorkPackages/Dependencies/Grouping,
 * resolveV2TemplateData, resolveProjectScopeTemplate's pinned branch) gate on
 * THIS, not on isVersionedV2TemplateData alone — otherwise a project pinned
 * to a real schemaVersion 2 template would silently fail this v1-only check
 * and fall back to the static legacy catalog, which is a correctness bug,
 * not a version-semantics decision (schemaVersion itself is read separately,
 * e.g. by resolveProjectScopeSelection, so this sharing never blurs the
 * "do not silently extend schemaVersion 1 semantics" contract rule).
 */
function isZonedTemplateShape(data) {
  return Boolean(
    data
    && data.model === ZONED_SCOPE_MODEL
    && data.templateType === V2_TEMPLATE_TYPE
    && Array.isArray(data.zones)
    && Array.isArray(data.dependencies)
  );
}

/**
 * Structural (shape) check for a schemaVersion 2 Master Catalog template —
 * same zoned physical layout as schemaVersion 1, plus a required
 * `defaultScope.workPackageIds` array. Deliberately mirrors
 * isVersionedV2TemplateData's shape rather than reusing/relaxing it, per the
 * "do not silently extend schemaVersion 1 semantics" contract rule — a v1
 * template can never satisfy this, and vice versa.
 */
export function isMasterCatalogTemplateData(data) {
  return Boolean(
    data
    && data.schemaVersion === MASTER_CATALOG_SCHEMA_VERSION
    && data.model === ZONED_SCOPE_MODEL
    && data.templateType === V2_TEMPLATE_TYPE
    && Array.isArray(data.zones)
    && Array.isArray(data.dependencies)
    && data.defaultScope
    && typeof data.defaultScope === 'object'
    && !Array.isArray(data.defaultScope)
    && Array.isArray(data.defaultScope.workPackageIds)
  );
}

/**
 * One canonical template-contract discriminator (Phase 8): the schema
 * version is always explicit and read from `data.schemaVersion` — never
 * inferred from the presence/absence of a field like `defaultScope`.
 * Returns null when `data` matches neither known contract.
 */
export function getTemplateContractVersion(data) {
  if (isMasterCatalogTemplateData(data)) return MASTER_CATALOG_SCHEMA_VERSION;
  if (isVersionedV2TemplateData(data)) return SCOPE_TEMPLATE_SCHEMA_VERSION;
  return null;
}

const CATALOG_CLASSES = new Set(['core', 'optional', 'specialized']);

// Approved controlled vocabulary for applicabilityTags (Slice 5C Phase 7).
// Structure/vocabulary only — this metadata does not drive any selection or
// recommendation logic in this slice.
const APPLICABILITY_TAG_VOCAB = {
  projectType: new Set(['new_fitout', 'refurbishment', 'relocation', 'minor_refresh']),
  location: new Set(['mall', 'street', 'large_format']),
  retailProfile: new Set(['fashion', 'electronics', 'beauty', 'jewelry', 'grocery', 'specialty']),
  system: new Set([
    'sprinklered', 'smoke_extraction', 'vrf_vrv', 'chilled_water', 'bms',
    'self_checkout', 'digital_signage', 'refrigeration', 'food_service',
    'high_security', 'customer_wc',
  ]),
};

function collectCatalogWorkPackages(data) {
  // Version-agnostic on purpose (v1 and v2 share the same zones/categories/
  // workPackages physical layout) — deliberately not reusing
  // getScopeTemplateWorkPackages, which gates on isVersionedV2TemplateData
  // (schemaVersion 1 only) and would reject v2 data outright.
  return (data.zones ?? []).flatMap(zone =>
    (zone.categories ?? []).flatMap(category =>
      (category.workPackages ?? []).map(wp => ({ ...wp, zoneId: zone.id, categoryId: category.id }))
    )
  );
}

/**
 * Deep semantic validation for a schemaVersion 2 template, beyond the
 * structural check in isMasterCatalogTemplateData. Mirrors the
 * {severity, code, message} issue-list convention already used by
 * engines/templateValidationEngine.js's validateTemplate() for the legacy
 * flat-template shape.
 *
 * Validates: defaultScope.workPackageIds are unique and every id exists in
 * this same template's catalog; catalogClass (where present) is one of
 * core/optional/specialized; applicabilityTags (where present) use only the
 * approved controlled vocabulary. An empty defaultScope.workPackageIds list
 * is NOT an error — Phase 5's contract explicitly allows it.
 */
export function validateMasterCatalogTemplateData(data) {
  if (!isMasterCatalogTemplateData(data)) {
    return [{ severity: 'error', code: 'INVALID_SHAPE', message: 'Not a structurally valid schemaVersion 2 Master Catalog template.' }];
  }

  const issues = [];
  const catalogWPs = collectCatalogWorkPackages(data);
  const catalogIds = new Set(catalogWPs.map(wp => wp.id));

  const seenDefaultIds = new Set();
  for (const id of data.defaultScope.workPackageIds) {
    if (seenDefaultIds.has(id)) {
      issues.push({ severity: 'error', code: 'DUP_DEFAULT_SCOPE_ID', message: `Duplicate defaultScope work package id "${id}".` });
    }
    seenDefaultIds.add(id);
    if (!catalogIds.has(id)) {
      issues.push({ severity: 'error', code: 'UNKNOWN_DEFAULT_SCOPE_ID', message: `defaultScope references unknown work package id "${id}".` });
    }
  }

  for (const wp of catalogWPs) {
    if (wp.catalogClass !== undefined && !CATALOG_CLASSES.has(wp.catalogClass)) {
      issues.push({ severity: 'error', code: 'INVALID_CATALOG_CLASS', message: `Work package "${wp.id}" has invalid catalogClass "${wp.catalogClass}".` });
    }

    if (wp.applicabilityTags !== undefined) {
      const tags = wp.applicabilityTags;
      if (typeof tags !== 'object' || tags === null || Array.isArray(tags)) {
        issues.push({ severity: 'error', code: 'INVALID_APPLICABILITY_TAGS', message: `Work package "${wp.id}" applicabilityTags must be an object.` });
      } else {
        for (const [dimension, values] of Object.entries(tags)) {
          const vocab = APPLICABILITY_TAG_VOCAB[dimension];
          if (!vocab) {
            issues.push({ severity: 'error', code: 'UNKNOWN_APPLICABILITY_DIMENSION', message: `Work package "${wp.id}" applicabilityTags has unknown dimension "${dimension}".` });
            continue;
          }
          if (!Array.isArray(values)) {
            issues.push({ severity: 'error', code: 'INVALID_APPLICABILITY_TAGS', message: `Work package "${wp.id}" applicabilityTags.${dimension} must be an array.` });
            continue;
          }
          for (const value of values) {
            if (!vocab.has(value)) {
              issues.push({ severity: 'error', code: 'UNKNOWN_APPLICABILITY_VALUE', message: `Work package "${wp.id}" applicabilityTags.${dimension} has unsupported value "${value}".` });
            }
          }
        }
      }
    }
  }

  return issues;
}

export function isMasterCatalogTemplateValid(data) {
  return validateMasterCatalogTemplateData(data).every(issue => issue.severity !== 'error');
}

/**
 * Canonical default-selection source of truth for a schemaVersion 2
 * template: `defaultScope.workPackageIds`. There is no second,
 * independently-persisted "defaultSelected" flag anywhere — presentation
 * code derives per-WP default-selected state by membership in this list.
 * Returns a fresh array (never the template's own array reference).
 */
export function getDefaultScopeWorkPackageIds(data) {
  return isMasterCatalogTemplateData(data) ? [...data.defaultScope.workPackageIds] : [];
}

export function getScopeTemplateWorkPackages(data) {
  if (!isZonedTemplateShape(data)) return [];
  return data.zones.flatMap(zone =>
    (zone.categories ?? []).flatMap(category =>
      (category.workPackages ?? []).map(wp => ({
        ...wp,
        phaseId: zone.id,
        zoneId: zone.id,
        categoryId: category.id,
      }))
    )
  );
}

export function getScopeTemplateDependencies(data) {
  if (!isZonedTemplateShape(data)) return [];
  return data.dependencies.map(rule => ({
    from: rule.from,
    to: rule.to,
    type: rule.type,
    lag_days: rule.lagDays,
  }));
}

export function getScopeTemplateGrouping(data, wpId) {
  if (!isZonedTemplateShape(data)) return null;
  for (const zone of data.zones) {
    for (const category of (zone.categories ?? [])) {
      const wp = (category.workPackages ?? []).find(candidate => candidate.id === wpId);
      if (wp) {
        return {
          templateType: data.templateType,
          zoneId: zone.id,
          zoneLabel: zone.label,
          categoryId: category.id,
          categoryLabel: category.label,
          wpId: wp.id,
          wpLabel: wp.label,
        };
      }
    }
  }
  return null;
}

export function resolveV2TemplateData(projectOrTemplate = null) {
  if (isZonedTemplateShape(projectOrTemplate)) return projectOrTemplate;
  if (isZonedTemplateShape(projectOrTemplate?.data)) return projectOrTemplate.data;
  if (projectOrTemplate?.templateType === V2_TEMPLATE_TYPE) {
    return resolveProjectScopeTemplate(projectOrTemplate)?.data
      ?? materializeRetailFitoutV2TemplateData();
  }
  return materializeRetailFitoutV2TemplateData();
}

export function normalizeTemplateRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const data = record.data && typeof record.data === 'object'
    ? record.data
    : (isVersionedV2TemplateData(record) ? record : null);
  return {
    id: record.id ?? null,
    name: record.name ?? data?.label ?? '',
    family: record.family ?? null,
    familyId: record.familyId ?? record.family_id ?? null,
    companyId: record.companyId ?? record.company_id ?? null,
    version: record.version ?? null,
    isActive: record.isActive ?? record.is_active ?? false,
    data,
  };
}

/**
 * One canonical project resolver.
 *
 * Supported cases:
 * - a project pinned to a persisted V2 template;
 * - a project pinned to a database V1/custom template;
 * - an historical V2 project with no valid persisted V2 pin (static
 *   compatibility definition, never inferred/backfilled);
 * - an unpinned non-V2 project (no resolved persisted template).
 */
export function resolveProjectScopeTemplate(project, context = {}) {
  const templatesById = context.templatesById ?? {};
  const pinnedCandidate = project?.templateId
    ? (project.scopeTemplate ?? templatesById[project.templateId] ?? null)
    : null;
  const pinned = normalizeTemplateRecord(pinnedCandidate);

  if (pinned?.data && isZonedTemplateShape(pinned.data)) {
    return {
      ...pinned,
      source: 'pinned',
      templateType: pinned.data.templateType,
      workPackages: getScopeTemplateWorkPackages(pinned.data),
      dependencies: getScopeTemplateDependencies(pinned.data),
      schedule: pinned.data.schedule,
    };
  }

  if (project?.templateType === V2_TEMPLATE_TYPE) {
    const data = materializeRetailFitoutV2TemplateData();
    return {
      id: null,
      name: data.label,
      family: RETAIL_FITOUT_V2_FAMILY,
      familyId: RETAIL_FITOUT_V2_FAMILY_ID,
      companyId: null,
      version: null,
      isActive: false,
      data,
      source: 'legacy-static',
      templateType: V2_TEMPLATE_TYPE,
      workPackages: getScopeTemplateWorkPackages(data),
      dependencies: getScopeTemplateDependencies(data),
      schedule: data.schedule,
    };
  }

  if (pinned) {
    return {
      ...pinned,
      source: 'pinned',
      templateType: project?.templateType ?? null,
      workPackages: pinned.data?.workPackages ?? [],
      dependencies: pinned.data?.dependencies ?? [],
      schedule: pinned.data?.schedule ?? null,
    };
  }

  return null;
}

export function selectDefaultScopeTemplate(records, {
  family = RETAIL_FITOUT_V2_FAMILY,
  companyId = null,
} = {}) {
  const applicable = (records ?? [])
    .map(normalizeTemplateRecord)
    .filter(record =>
      record
      && record.family === family
      && record.isActive
      && isVersionedV2TemplateData(record.data)
    );
  const companyDefault = companyId == null
    ? null
    : applicable.find(record => record.companyId === companyId);
  return companyDefault
    ?? applicable.find(record => record.companyId == null)
    ?? null;
}
