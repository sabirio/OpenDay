import {
  getAllowedNavItems, getAllowedNavItemsForUser, getDefaultRoute, canAccess,
} from '../../engines/permissionEngine.js';
import {
  filterProjectsForOrganization, resolveActiveWorkspace,
  resolveAvailableWorkspaces, resolveWorkspaceDefaultRoute,
} from '../../domains/workspaces/workspaceModel.js';

export function getDefaultRouteForRole(role) {
  return getDefaultRoute(role);
}

export function getAllowedNavItemsForRole(role, navItems) {
  return getAllowedNavItems(role, navItems);
}

export function getAllowedNavItemsForSession(user, navItems, workspaceId) {
  return getAllowedNavItemsForUser(user, navItems, workspaceId);
}

export function buildWorkspaceAccess(user, requestedWorkspaceId) {
  const capabilities = user?.effectiveCapabilities ?? [];
  const availableWorkspaces = resolveAvailableWorkspaces({
    capabilities,
    canAccessResource: resource => getAllowedNavItemsForUser(user, [{ resource }]).length > 0,
  });
  const activeWorkspace = resolveActiveWorkspace(availableWorkspaces, requestedWorkspaceId);
  return { availableWorkspaces, activeWorkspace };
}

export function getWorkspaceDefaultRoute(workspace, user) {
  const routeResource = {
    '/home': 'dashboard', '/projects': 'projects', '/weekly-reports': 'weekly_reports',
    '/consultant-boqs': 'consultant_boq', '/site-visit-select': 'site_visit', '/snags': 'snags',
  };
  return resolveWorkspaceDefaultRoute(workspace, path => (
    !routeResource[path] || getAllowedNavItemsForUser(user, [{ resource: routeResource[path] }]).length > 0
  ));
}

export { filterProjectsForOrganization };

// Facade for canAccess — pages/components must never import engines/
// directly (architecture guard HARD rule); this lets a page conditionally
// render an action (e.g. Portfolio's "Import Projects" button) using the
// exact same permission rule ProtectedRoute enforces at the route level,
// without reaching into engines/ itself.
export function canAccessResource(role, resource) {
  return canAccess(role, resource);
}
