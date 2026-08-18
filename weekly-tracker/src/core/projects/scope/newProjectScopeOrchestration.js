import {
  RETAIL_FITOUT_V2_FAMILY,
  MASTER_CATALOG_SCHEMA_VERSION,
  getDefaultScopeWorkPackageIds,
} from '../../../domains/construction/templates/versionedScopeTemplate.js';

export const PROJECT_SCOPE_NOT_CONFIGURED = 'Project scope template is not configured.';

export function buildNewProjectDraft(baseProject, scopeTemplate, workOntology = null) {
  if (!scopeTemplate?.id || scopeTemplate.family !== RETAIL_FITOUT_V2_FAMILY) {
    throw new Error(PROJECT_SCOPE_NOT_CONFIGURED);
  }

  const isMasterCatalog = scopeTemplate.data?.schemaVersion === MASTER_CATALOG_SCHEMA_VERSION;

  const scope = isMasterCatalog
    ? { workPackages: getDefaultScopeWorkPackageIds(scopeTemplate.data) }
    : null;
  const selectableDisciplineIds = workOntology?.disciplines
    ?.filter(item => item.scopeSelectable !== false)
    .map(item => item.id);

  return {
    ...baseProject,
    templateType: RETAIL_FITOUT_V2_FAMILY,
    templateId: scopeTemplate.id,
    scopeTemplate,
    // schemaVersion 1 (legacy, unchanged): a null selection intentionally
    // means the pinned template's complete certified default scope — the
    // same as opening the configurator and accepting all currently
    // selected work packages.
    //
    // schemaVersion 2 (Master Catalog): null must NOT implicitly mean "every
    // catalog work package" once the catalog is comprehensive, so the new
    // project is initialized with an EXPLICIT scope materialized from the
    // template's own canonical defaultScope.workPackageIds — set once here,
    // at creation time, with no Configurator round-trip required.
    scope: workOntology?.id
      ? {
          ...(scope || {}),
          workOntologyVersionId: workOntology.id,
          disciplineIds: selectableDisciplineIds,
        }
      : scope,
    workOntology: workOntology || null,
  };
}

export async function initializeNewProjectScope(
  baseProject,
  resolveDefault = null,
  resolveWorkOntology = null,
) {
  const resolver = resolveDefault
    ?? (await import('../../../services/templateService.js')).resolveDefaultScopeTemplateForCurrentCompany;
  const ontologyResolver = resolveWorkOntology
    ?? (await import('../../../services/workOntologyService.js')).resolveActiveWorkOntologyForCurrentCompany;
  const [scopeTemplate, workOntology] = await Promise.all([
    resolver(RETAIL_FITOUT_V2_FAMILY),
    ontologyResolver(),
  ]);
  return buildNewProjectDraft(baseProject, scopeTemplate, workOntology);
}
