import { RETAIL_FITOUT_V2_FAMILY } from '../../../domains/construction/templates/versionedScopeTemplate.js';

export const PROJECT_SCOPE_NOT_CONFIGURED = 'Project scope template is not configured.';

export function buildNewProjectDraft(baseProject, scopeTemplate) {
  if (!scopeTemplate?.id || scopeTemplate.family !== RETAIL_FITOUT_V2_FAMILY) {
    throw new Error(PROJECT_SCOPE_NOT_CONFIGURED);
  }

  return {
    ...baseProject,
    templateType: RETAIL_FITOUT_V2_FAMILY,
    templateId: scopeTemplate.id,
    scopeTemplate,
    // A null selection intentionally means the pinned template's complete
    // certified default scope. It is equivalent to opening the configurator
    // and accepting all currently selected work packages.
    scope: null,
  };
}

export async function initializeNewProjectScope(
  baseProject,
  resolveDefault = null,
) {
  const resolver = resolveDefault
    ?? (await import('../../../services/templateService.js')).resolveDefaultScopeTemplateForCurrentCompany;
  const scopeTemplate = await resolver(RETAIL_FITOUT_V2_FAMILY);
  return buildNewProjectDraft(baseProject, scopeTemplate);
}
