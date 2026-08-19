import { PERMISSIONS, ROLE_REDIRECTS } from '../auth/rolePermissions';
import { isResourceEntitled } from '../domains/workspaces/workspaceModel.js';

// Returns true when `role` is allowed to access `resource`.
// Never hardcode permission checks inside page components — always call this.
export function canAccess(role, resource) {
  if (!role || !resource) return false;
  const perms = PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes('all')) return true;
  return perms.includes(resource);
}

export function canAccessUser(user, resource) {
  if (!user || !resource) return false;
  const permissions = user.permissions ?? [];
  const permitted = permissions.includes('all') || permissions.includes(resource);
  if (!permitted) return false;
  return isResourceEntitled(resource, user.effectiveCapabilities ?? []);
}

// Returns the default landing path for a given role after login.
export function getDefaultRoute(role) {
  return ROLE_REDIRECTS[role] ?? '/login';
}

// Returns a filtered list of nav items the role can see.
export function getAllowedNavItems(role, navItems) {
  return navItems.flatMap((item) => {
    if (item.children) {
      const children = item.children.filter((child) => canAccess(role, child.resource));
      return children.length ? [{ ...item, children }] : [];
    }
    return canAccess(role, item.resource) ? [item] : [];
  });
}

export function getAllowedNavItemsForUser(user, navItems, workspaceId = null) {
  return navItems.flatMap((item) => {
    if (workspaceId && item.workspaceId && item.workspaceId !== workspaceId) return [];
    if (workspaceId && item.workspaceIds && !item.workspaceIds.includes(workspaceId)) return [];
    if (item.children) {
      const children = item.children.filter(child => (
        (!workspaceId || !child.workspaceIds || child.workspaceIds.includes(workspaceId))
        && canAccessUser(user, child.resource)
      ));
      return children.length ? [{ ...item, children }] : [];
    }
    return canAccessUser(user, item.resource) ? [item] : [];
  });
}
