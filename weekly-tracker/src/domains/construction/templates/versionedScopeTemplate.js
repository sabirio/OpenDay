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
// Slice 5E.2B weight fingerprints. Arrays retain authored catalog order;
// object keys are recursively sorted before JSON hashing. Exact normalization
// is certified in masterCatalogWeightCalibration.test.mjs.
export const RETAIL_FITOUT_MASTER_CATALOG_ELIGIBILITY_SHA256 =
  '0e0c6769f394eb2129cab151555d653b5d22574c08889ef15c1aea2d608c73c3';
export const RETAIL_FITOUT_MASTER_CATALOG_BASE_EFFORT_SHA256 =
  '4a34df99b032885183dc30b8e8a4d9c89c35ccf71c48f1c8ef2e35de70ea8afa';
export const RETAIL_FITOUT_MASTER_CATALOG_CATEGORY_FACTOR_SHA256 =
  '1189fc5d8516c8de05c3f9a31ab61179a020874d4b57324cd0af8f128611458b';
export const RETAIL_FITOUT_MASTER_CATALOG_GROUP_WEIGHT_SETTINGS_SHA256 =
  'cb6c32d47fd101ee2d1d23eaff1e686b30023ed14b89ddce39aa9e39dbbabd47';
export const RETAIL_FITOUT_MASTER_CATALOG_WEIGHT_METADATA_SHA256 =
  '7a20a69fde01c5c4d7acccab87c102046765ed33911f6876046948fafa5d133b';
export const RETAIL_FITOUT_MASTER_CATALOG_OPERATIONAL_SEMANTIC_SHA256 =
  '4078983e76f12cae9ceac48a05e1469eaebcf478c6da6d520f528fa50608ecf6';

/**
 * Deterministic materializer for the approved, weight-operational 221-WP
 * Master Catalog candidate. Duration and blocker/readiness/schedule metadata
 * remain deliberately absent. `dependencies: []` remains the approved
 * structural placeholder until the duration/dependency model is authored.
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

// Slice 5E.1 — canonical enum for the Master Catalog weight contract's
// group-level `areaBasis` field. Deliberately the same 4 canonical values
// as PROJECT_AREA_BASIS (resolveProjectArea.js) — not a parallel/renamed
// enum — even though only NONE/SALES_AREA/BOH_AREA are actually assigned to
// a group in the current 3-group design; TOTAL_AREA is kept for schema
// completeness/future-proofing, matching the canonical area-fact set.
const MASTER_CATALOG_AREA_BASIS_VALUES = new Set(['TOTAL_AREA', 'SALES_AREA', 'BOH_AREA', 'NONE']);

/**
 * Validates the Master Catalog WEIGHT metadata contract (Slice 5E.1) —
 * distinct from validateMasterCatalogTemplateData() above, which only
 * checks the structural/defaultScope contract every schemaVersion 2
 * template must already satisfy (including the real, currently
 * weight-less, 221-WP candidate). This function checks the ADDITIONAL
 * fields an OPERATIONAL weight calculation needs:
 *
 *   WP.constructionProgressEligible — required boolean on every WP
 *   WP.baseEffort                   — required, positive finite, only on
 *                                      eligible WPs (ineligible WPs never
 *                                      enter the calculation, so their
 *                                      baseEffort is never read)
 *   category.categoryFactor         — required, positive finite, only on
 *                                      categories that contain >=1 eligible
 *                                      WP (a category with none is never
 *                                      selected into the calculation)
 *   zone.areaBasis                  — required, one of the 4 canonical
 *                                      values
 *   zone.anchorPct                  — required (finite, 0 < x < 100) when
 *                                      areaBasis === 'NONE' (the fixed
 *                                      top-level anchor group)
 *   zone.defaultWeight               — required (positive finite) when
 *                                      areaBasis !== 'NONE' — the explicit,
 *                                      template-authored missing/zero-area
 *                                      fallback ratio computeZoneWeights()
 *                                      already supports; deliberately NOT
 *                                      a hardcoded 45:20 v1 business value.
 *
 * Deliberately does NOT default any of these when missing — a template
 * lacking them is not a valid input for an operational weight calculation,
 * and this function's whole purpose is to make that failure explicit
 * rather than silently computing a wrong (typically all-zero) result.
 */
export function validateMasterCatalogWeightMetadata(data) {
  if (!isMasterCatalogTemplateData(data)) {
    return [{ severity: 'error', code: 'INVALID_SHAPE', message: 'Not a structurally valid schemaVersion 2 Master Catalog template.' }];
  }

  const issues = [];
  for (const zone of data.zones ?? []) {
    if (!MASTER_CATALOG_AREA_BASIS_VALUES.has(zone.areaBasis)) {
      issues.push({ severity: 'error', code: 'MISSING_AREA_BASIS', message: `Zone "${zone.id}" areaBasis must be one of TOTAL_AREA/SALES_AREA/BOH_AREA/NONE.` });
    } else if (zone.areaBasis === 'NONE') {
      const anchor = zone.anchorPct;
      if (!(typeof anchor === 'number' && Number.isFinite(anchor) && anchor > 0 && anchor < 100)) {
        issues.push({ severity: 'error', code: 'MISSING_ANCHOR_PCT', message: `Zone "${zone.id}" (areaBasis NONE) requires a finite anchorPct strictly between 0 and 100.` });
      }
    } else {
      const defaultWeight = zone.defaultWeight;
      if (!(typeof defaultWeight === 'number' && Number.isFinite(defaultWeight) && defaultWeight > 0)) {
        issues.push({ severity: 'error', code: 'MISSING_DEFAULT_WEIGHT', message: `Zone "${zone.id}" (areaBasis ${zone.areaBasis}) requires a positive finite defaultWeight fallback ratio.` });
      }
    }

    for (const category of zone.categories ?? []) {
      const workPackages = category.workPackages ?? [];
      const eligibleWPs = workPackages.filter(wp => wp.constructionProgressEligible === true);
      if (eligibleWPs.length > 0) {
        const categoryFactor = category.categoryFactor;
        if (!(typeof categoryFactor === 'number' && Number.isFinite(categoryFactor) && categoryFactor > 0)) {
          issues.push({ severity: 'error', code: 'MISSING_CATEGORY_FACTOR', message: `Category "${category.id}" contains eligible work packages but has no positive finite categoryFactor.` });
        }
      }
      for (const wp of workPackages) {
        if (typeof wp.constructionProgressEligible !== 'boolean') {
          issues.push({ severity: 'error', code: 'MISSING_ELIGIBILITY_FLAG', message: `Work package "${wp.id}" is missing a required constructionProgressEligible boolean.` });
        }
        if (wp.constructionProgressEligible === true) {
          const baseEffort = wp.baseEffort;
          if (!(typeof baseEffort === 'number' && Number.isFinite(baseEffort) && baseEffort > 0)) {
            issues.push({ severity: 'error', code: 'MISSING_BASE_EFFORT', message: `Eligible work package "${wp.id}" requires a positive finite baseEffort.` });
          }
        }
      }
    }
  }
  return issues;
}

export function isOperationalMasterCatalogWeightModel(data) {
  return validateMasterCatalogWeightMetadata(data).every(issue => issue.severity !== 'error');
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
