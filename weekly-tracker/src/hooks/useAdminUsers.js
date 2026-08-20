import { useCallback, useEffect, useState } from 'react';
import {
  commitAdminUser, loadAdminUsers, removeAdminUser, sendAdminUserInvitation,
} from '../core/users/adminUserOrchestration.js';

export function useAdminUsers(organizationId) {
  const [state, setState] = useState({ status: 'loading', users: [], invitations: [], error: null });
  const [saving, setSaving] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [inviting, setInviting] = useState(false);
  const load = useCallback(async () => {
    if (!organizationId) {
      setState({ status: 'error', users: [], invitations: [], error: new Error('ORGANIZATION_ADMIN_REQUIRED') });
      return;
    }
    try {
      const result = await loadAdminUsers(organizationId);
      setState({ status: 'ready', users: result.users || [], invitations: result.invitations || [], error: null });
    } catch (error) {
      setState({ status: 'error', users: [], invitations: [], error });
    }
  }, [organizationId]);
  useEffect(() => {
    let active = true;
    if (!organizationId) return () => { active = false; };
    loadAdminUsers(organizationId)
      .then(result => {
        if (active) setState({ status: 'ready', users: result.users || [], invitations: result.invitations || [], error: null });
      })
      .catch(error => {
        if (active) setState({ status: 'error', users: [], invitations: [], error });
      });
    return () => { active = false; };
  }, [organizationId]);
  const save = async user => {
    setSaving(user.id);
    try { const result = await commitAdminUser(organizationId, user); await load(); return result; }
    finally { setSaving(null); }
  };
  const remove = async user => {
    setRemoving(user.id);
    try { const result = await removeAdminUser(organizationId, user); await load(); return result; }
    finally { setRemoving(null); }
  };
  const invite = async input => {
    setInviting(true);
    try { const result = await sendAdminUserInvitation(organizationId, input); await load(); return result; }
    finally { setInviting(false); }
  };
  return { ...state, saving, removing, inviting, retry: load, save, remove, invite };
}
