import assert from 'node:assert/strict';
import {
  filterProjectsForOrganization, isResourceEntitled, resolveActiveWorkspace,
  resolveAvailableWorkspaces, resolveWorkspaceDefaultRoute,
} from './workspaceModel.js';

const capabilities = ['core.projects', 'portfolio.overview', 'construction.control', 'weekly.reports', 'site.visits'];
const allowedResources = new Set(['dashboard', 'projects', 'weekly_reports', 'risk_engine', 'site_visit']);
const workspaces = resolveAvailableWorkspaces({
  capabilities,
  canAccessResource: resource => allowedResources.has(resource) && isResourceEntitled(resource, capabilities),
});

assert.deepEqual(workspaces.map(workspace => workspace.id), ['portfolio', 'delivery', 'field']);
assert.equal(resolveActiveWorkspace(workspaces, 'field').id, 'field');
assert.equal(resolveActiveWorkspace(workspaces, 'commercial').id, 'portfolio');
assert.equal(resolveWorkspaceDefaultRoute(workspaces[1], path => path !== '/weekly-reports'), '/home');
assert.equal(isResourceEntitled('weekly_reports', ['core.projects']), false);
assert.equal(isResourceEntitled('opportunities', ['opportunities.pipeline']), true);
assert.equal(isResourceEntitled('estimates', ['opportunities.pipeline']), false);
assert.equal(isResourceEntitled('admin_users', []), true);

const businessDevelopment = resolveAvailableWorkspaces({
  capabilities: ['opportunities.pipeline', 'estimating.delivery'],
  canAccessResource: resource => ['business_development', 'opportunities', 'estimates'].includes(resource),
});
assert.deepEqual(businessDevelopment.map(workspace => workspace.id), ['business-development']);
assert.equal(resolveWorkspaceDefaultRoute(businessDevelopment[0]), '/business-development');
assert.deepEqual(filterProjectsForOrganization([
  { id: 1, organizationId: 'org-a', companyId: 'legacy-a' },
  { id: 2, organizationId: 'org-b', companyId: 'legacy-b' },
  { id: 3, companyId: 'legacy-a' },
], { organizationId: 'org-a', legacyCompanyId: 'legacy-a' }).map(project => project.id), [1, 3]);

console.log('workspaceModel: all checks passed');
