import {
  ALL_WORK_PACKAGES_V2,
  CATEGORY_LIBRARY,
  retailFitoutV2,
  V2_TEMPLATE_TYPE,
} from './retailFitoutV2.js';
import { DEPENDENCY_RULES_V2 } from '../../../config/dependencyRulesV2.js';

export const SCOPE_TEMPLATE_SCHEMA_VERSION = 1;
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

export function getScopeTemplateWorkPackages(data) {
  if (!isVersionedV2TemplateData(data)) return [];
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
  if (!isVersionedV2TemplateData(data)) return [];
  return data.dependencies.map(rule => ({
    from: rule.from,
    to: rule.to,
    type: rule.type,
    lag_days: rule.lagDays,
  }));
}

export function getScopeTemplateGrouping(data, wpId) {
  if (!isVersionedV2TemplateData(data)) return null;
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
  if (isVersionedV2TemplateData(projectOrTemplate)) return projectOrTemplate;
  if (isVersionedV2TemplateData(projectOrTemplate?.data)) return projectOrTemplate.data;
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

  if (pinned?.data && isVersionedV2TemplateData(pinned.data)) {
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
