import {
  buildWorkspaceAccess, getWorkspaceDefaultRoute,
} from '../core/auth/navigationModel.js';

const STORAGE_PREFIX = 'openday.workspace.v1';

export function safeRead(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function safeWrite(key, value) {
  try { localStorage.setItem(key, value); } catch { /* browser storage may be unavailable */ }
}

export function organizationStorageKey(userId) {
  return `${STORAGE_PREFIX}.${userId}.organization`;
}

export function workspaceStorageKey(userId, organizationId) {
  return `${STORAGE_PREFIX}.${userId}.${organizationId}.workspace`;
}

export function resolveInitialWorkspaceSelection(user) {
  if (!user?.id) return { userId: null, organizationId: null, workspaceId: null };
  const organizations = user.organizations ?? [];
  const storedOrganizationId = safeRead(organizationStorageKey(user.id));
  const organization = organizations.find(item => item.organizationId === storedOrganizationId)
    ?? organizations[0]
    ?? null;
  return {
    userId: user.id,
    organizationId: organization?.organizationId ?? null,
    workspaceId: organization
      ? safeRead(workspaceStorageKey(user.id, organization.organizationId))
      : null,
  };
}

export function resolveRememberedDefaultRoute(user) {
  const selection = resolveInitialWorkspaceSelection(user);
  const organization = (user?.organizations ?? []).find(
    item => item.organizationId === selection.organizationId,
  ) ?? null;
  const scopedUser = user ? {
    ...user,
    activeOrganizationId: organization?.organizationId ?? null,
    effectiveCapabilities: organization?.effectiveCapabilities ?? [],
  } : null;
  const { activeWorkspace } = buildWorkspaceAccess(scopedUser, selection.workspaceId);
  if (!activeWorkspace && user?.platformSuperadmin === true) return '/platform-admin';
  return getWorkspaceDefaultRoute(activeWorkspace, scopedUser);
}
