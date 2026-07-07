import { getAllowedNavItems, getDefaultRoute } from '../../engines/permissionEngine.js';

export function getDefaultRouteForRole(role) {
  return getDefaultRoute(role);
}

export function getAllowedNavItemsForRole(role, navItems) {
  return getAllowedNavItems(role, navItems);
}
