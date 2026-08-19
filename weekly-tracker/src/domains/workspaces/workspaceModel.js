export const WORKSPACES = Object.freeze([
  {
    id: 'portfolio',
    label: 'Portfolio',
    capabilityIds: ['core.projects', 'portfolio.overview', 'budgeting.departmental', 'financials.cost'],
    resourceCandidates: ['dashboard', 'projects', 'budget_workspace'],
    defaultRoutes: ['/home', '/projects'],
  },
  {
    id: 'business-development',
    label: 'Business Development',
    capabilityIds: ['opportunities.pipeline', 'estimating.delivery', 'pricing.commercial', 'proposals.issue'],
    resourceCandidates: [],
    defaultRoutes: [],
  },
  {
    id: 'delivery',
    label: 'Delivery',
    capabilityIds: ['design.delivery', 'construction.delivery', 'schedule.management', 'deliverables.management', 'construction.control', 'weekly.reports'],
    resourceCandidates: ['weekly_reports', 'risk_engine', 'weight_audit', 'contractor_report', 'schedule_review', 'contractor_schedule'],
    defaultRoutes: ['/weekly-reports', '/home', '/projects'],
  },
  {
    id: 'procurement',
    label: 'Procurement',
    capabilityIds: ['procurement.management', 'tendering.main', 'subcontractor.tendering', 'supplier.management'],
    resourceCandidates: ['consultant_boq', 'tender_setup', 'boq_editor'],
    defaultRoutes: ['/consultant-boqs', '/projects', '/home'],
  },
  {
    id: 'commercial',
    label: 'Commercial',
    capabilityIds: ['commercial.cost', 'commercial.revenue', 'commercial.margin', 'commercial.forecast', 'variations.management', 'payments.management', 'financials.cost', 'budgeting.departmental'],
    resourceCandidates: ['budget_workspace', 'variations', 'payments', 'commercial_approvals'],
    defaultRoutes: ['/projects', '/home'],
  },
  {
    id: 'field',
    label: 'Field',
    capabilityIds: ['site.visits', 'snags.management'],
    resourceCandidates: ['site_visit', 'snags'],
    defaultRoutes: ['/site-visit-select', '/snags', '/home'],
  },
]);

// Product entitlements and user/project permissions are intentionally
// separate inputs. A wildcard application role never bypasses this map.
export const RESOURCE_CAPABILITY_REQUIREMENTS = Object.freeze({
  dashboard: ['core.projects'],
  projects: ['core.projects'],
  projects_import: ['core.projects'],
  weekly_reports: ['weekly.reports'],
  risk_engine: ['construction.control'],
  weight_audit: ['construction.control'],
  site_visit: ['site.visits'],
  snags: ['snags.management'],
  contractor_report: ['construction.control', 'construction.delivery'],
  contractor_schedule: ['schedule.management', 'construction.delivery'],
  schedule_review: ['schedule.management', 'construction.control'],
  commercial_setup: ['core.team', 'financials.cost', 'commercial.cost', 'procurement.management', 'tendering.main'],
  boq_editor: ['tendering.main', 'procurement.management'],
  consultant_boq: ['tendering.main', 'procurement.management'],
  tender_setup: ['tendering.main', 'subcontractor.tendering'],
  budget_workspace: ['budgeting.departmental'],
  variations: ['variations.management'],
  payments: ['payments.management'],
  closeout: ['construction.control', 'commercial.cost'],
  commercial_approvals: ['financials.cost', 'commercial.cost'],
});

function asCapabilitySet(capabilities = []) {
  return new Set(capabilities.map(capability => (
    typeof capability === 'string' ? capability : capability?.capabilityId
  )).filter(Boolean));
}

export function hasAnyCapability(capabilities, required = []) {
  if (required.length === 0) return true;
  const available = asCapabilitySet(capabilities);
  return required.some(capabilityId => available.has(capabilityId));
}

export function isResourceEntitled(resource, capabilities) {
  const required = RESOURCE_CAPABILITY_REQUIREMENTS[resource] ?? [];
  return hasAnyCapability(capabilities, required);
}

export function resolveAvailableWorkspaces({ capabilities = [], canAccessResource = () => false } = {}) {
  return WORKSPACES.filter(workspace => (
    workspace.defaultRoutes.length > 0
    && hasAnyCapability(capabilities, workspace.capabilityIds)
    && workspace.resourceCandidates.some(resource => canAccessResource(resource))
  ));
}

export function resolveActiveWorkspace(availableWorkspaces, requestedWorkspaceId) {
  return availableWorkspaces.find(workspace => workspace.id === requestedWorkspaceId)
    ?? availableWorkspaces[0]
    ?? null;
}

export function resolveWorkspaceDefaultRoute(workspace, canAccessPath = () => true) {
  return workspace?.defaultRoutes.find(canAccessPath) ?? '/unauthorized';
}

export function filterProjectsForOrganization(projects = [], organization = null) {
  if (!organization) return [];
  return projects.filter(project => {
    if (project.organizationId) return project.organizationId === organization.organizationId;
    return project.companyId != null && String(project.companyId) === String(organization.legacyCompanyId);
  });
}
