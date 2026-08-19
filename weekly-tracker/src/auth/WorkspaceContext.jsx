import { useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { WorkspaceContext } from './workspaceContextValue.js';
import {
  organizationStorageKey, resolveInitialWorkspaceSelection, safeRead, safeWrite,
  workspaceStorageKey,
} from './workspaceSelection.js';
import {
  buildWorkspaceAccess, getWorkspaceDefaultRoute,
} from '../core/auth/navigationModel.js';

export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [selection, setSelection] = useState(() => resolveInitialWorkspaceSelection(user));

  if ((user?.id ?? null) !== selection.userId) {
    setSelection(resolveInitialWorkspaceSelection(user));
  }

  const organizations = user?.organizations ?? [];
  const activeOrganization = organizations.find(item => item.organizationId === selection.organizationId)
    ?? organizations[0]
    ?? null;
  const scopedUser = useMemo(() => user ? ({
    ...user,
    activeOrganizationId: activeOrganization?.organizationId ?? null,
    effectiveCapabilities: activeOrganization?.effectiveCapabilities ?? [],
  }) : null, [user, activeOrganization]);
  const { availableWorkspaces, activeWorkspace } = useMemo(
    () => buildWorkspaceAccess(scopedUser, selection.workspaceId),
    [scopedUser, selection.workspaceId],
  );

  function setActiveOrganizationId(organizationId) {
    const organization = organizations.find(item => item.organizationId === organizationId);
    if (!organization || !user?.id) return;
    const requestedWorkspaceId = safeRead(workspaceStorageKey(user.id, organizationId));
    safeWrite(organizationStorageKey(user.id), organizationId);
    setSelection({ userId: user.id, organizationId, workspaceId: requestedWorkspaceId });
  }

  function setActiveWorkspaceId(workspaceId) {
    if (!user?.id || !activeOrganization) return;
    if (!availableWorkspaces.some(workspace => workspace.id === workspaceId)) return;
    safeWrite(workspaceStorageKey(user.id, activeOrganization.organizationId), workspaceId);
    setSelection(current => ({ ...current, workspaceId }));
  }

  const value = {
    organizations,
    activeOrganization,
    availableWorkspaces,
    activeWorkspace,
    scopedUser,
    defaultRoute: !activeWorkspace && user?.platformSuperadmin === true
      ? '/platform-admin'
      : getWorkspaceDefaultRoute(activeWorkspace, scopedUser),
    setActiveOrganizationId,
    setActiveWorkspaceId,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
