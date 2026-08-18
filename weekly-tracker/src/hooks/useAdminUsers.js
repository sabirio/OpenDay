import { useCallback, useEffect, useState } from 'react';
import { commitAdminUser, loadAdminUsers, removeAdminUser } from '../core/users/adminUserOrchestration.js';

export function useAdminUsers() {
  const [state, setState] = useState({ status: 'loading', users: [], error: null });
  const [saving, setSaving] = useState(null);
  const [removing, setRemoving] = useState(null);
  const load = useCallback(async () => {
    try { setState({ status: 'ready', users: await loadAdminUsers(), error: null }); }
    catch (error) { setState({ status: 'error', users: [], error }); }
  }, []);
  useEffect(() => {
    let active = true;
    loadAdminUsers()
      .then(users => { if (active) setState({ status: 'ready', users, error: null }); })
      .catch(error => { if (active) setState({ status: 'error', users: [], error }); });
    return () => { active = false; };
  }, []);
  const save = async user => {
    setSaving(user.id);
    try { const result = await commitAdminUser(user); await load(); return result; }
    finally { setSaving(null); }
  };
  const remove = async userId => {
    setRemoving(userId);
    try { const result = await removeAdminUser(userId); await load(); return result; }
    finally { setRemoving(null); }
  };
  return { ...state, saving, removing, retry: load, save, remove };
}
