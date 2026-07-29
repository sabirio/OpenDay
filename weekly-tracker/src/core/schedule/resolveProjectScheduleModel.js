import {
  MASTER_CATALOG_SCHEMA_VERSION,
  SCOPE_TEMPLATE_SCHEMA_VERSION,
} from '../../domains/construction/templates/versionedScopeTemplate.js';
import { validateMasterCatalogDurationMetadata } from './durationContract.js';

export const PROJECT_SCHEDULE_ROUTE = Object.freeze({
  LEGACY_WINDOW_FITTING: 'LEGACY_WINDOW_FITTING',
  MASTER_CATALOG_DURATION_V2: 'MASTER_CATALOG_DURATION_V2',
});

function resolveTemplateData(project, pinnedTemplate) {
  return pinnedTemplate?.data
    ?? pinnedTemplate
    ?? project?.scopeTemplate?.data
    ?? project?.scopeTemplate
    ?? null;
}

/**
 * Canonical future routing boundary. It does not generate or persist a Gantt
 * in Slice 5F.1; it only makes the schedule contract decision once.
 *
 * Existing callers remain on the certified Gantt path. Wiring this resolver
 * into real generation is deferred until schema-v2 duration values,
 * dependencies, markers, and zero-day adaptation exist.
 */
export function resolveProjectScheduleModel({ project = null, pinnedTemplate = null } = {}) {
  const data = resolveTemplateData(project, pinnedTemplate);
  const schemaVersion = data?.schemaVersion ?? null;

  if (schemaVersion === SCOPE_TEMPLATE_SCHEMA_VERSION) {
    return {
      schemaVersion,
      route: PROJECT_SCHEDULE_ROUTE.LEGACY_WINDOW_FITTING,
      operational: true,
      issues: [],
      durationModel: null,
    };
  }

  if (schemaVersion === MASTER_CATALOG_SCHEMA_VERSION) {
    const issues = validateMasterCatalogDurationMetadata(data);
    return {
      schemaVersion,
      route: PROJECT_SCHEDULE_ROUTE.MASTER_CATALOG_DURATION_V2,
      operational: issues.every(issue => issue.severity !== 'error'),
      issues,
      durationModel: data.durationModel ?? null,
    };
  }

  return {
    schemaVersion,
    route: null,
    operational: false,
    issues: [{
      severity: 'error',
      code: 'UNKNOWN_SCHEDULE_SCHEMA_VERSION',
      message: 'A pinned schemaVersion 1 or schemaVersion 2 template is required.',
    }],
    durationModel: null,
  };
}
