import {
  RETAIL_FITOUT_V2_FAMILY,
  resolveProjectScopeTemplate,
} from '../../../domains/construction/templates/versionedScopeTemplate.js';
import { resolveProjectAreaContext } from '../areas/resolveProjectArea.js';

function formatArea(value) {
  if (value == null) return 'Not set';
  return `${new Intl.NumberFormat().format(value)} m²`;
}

export function usesUnifiedProjectScopeEntry(project, { isEditing = false } = {}) {
  return !isEditing || project?.templateType === RETAIL_FITOUT_V2_FAMILY;
}

export function buildProjectScopeEntryModel(project) {
  const resolvedTemplate = resolveProjectScopeTemplate(project);
  const explicitSelection = Array.isArray(project?.scope?.workPackages);
  const selectedWorkPackageCount = explicitSelection
    ? project.scope.workPackages.length
    : (resolvedTemplate?.workPackages?.length ?? 0);
  const areaContext = resolveProjectAreaContext(project);

  return {
    selectedWorkPackageCount,
    explicitSelection,
    salesArea: areaContext.salesArea,
    backOfHouseArea: areaContext.bohArea,
    salesAreaLabel: formatArea(areaContext.salesArea),
    backOfHouseAreaLabel: formatArea(areaContext.bohArea),
  };
}

export function buildProjectScopeConfiguratorModel(project) {
  const resolvedTemplate = resolveProjectScopeTemplate(project);
  if (resolvedTemplate?.templateType !== RETAIL_FITOUT_V2_FAMILY) return null;

  return {
    templateType: resolvedTemplate.templateType,
    templateId: resolvedTemplate.id,
    source: resolvedTemplate.source,
    data: resolvedTemplate.data,
    zones: resolvedTemplate.data.zones,
  };
}
