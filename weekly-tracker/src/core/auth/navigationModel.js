import { getAllowedNavItems, getDefaultRoute, canAccess } from '../../engines/permissionEngine.js';

export function getDefaultRouteForRole(role) {
  return getDefaultRoute(role);
}

export function getAllowedNavItemsForRole(role, navItems) {
  return getAllowedNavItems(role, navItems);
}

// Facade for canAccess — pages/components must never import engines/
// directly (architecture guard HARD rule); this lets a page conditionally
// render an action (e.g. Portfolio's "Import Projects" button) using the
// exact same permission rule ProtectedRoute enforces at the route level,
// without reaching into engines/ itself.
export function canAccessResource(role, resource) {
  return canAccess(role, resource);
}
