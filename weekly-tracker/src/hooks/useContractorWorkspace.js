import { useCallback, useEffect, useState } from 'react';
import { loadContractorWorkspaceRows } from '../core/contractorWorkspace/loadContractorWorkspaceRows.js';

/**
 * "My Work" for the Contractor Workspace — one row per assigned project with
 * report status and actionable-snag count. `actorId`/`actorRole` are passed
 * as scalars (not a `user` object) so the fetch only re-runs when identity
 * actually changes, not on every parent re-render.
 */
export function useContractorWorkspace(projects, reports, actorId, actorRole) {
  const [state, setState] = useState({ status: 'idle', rows: [], error: null });

  const load = useCallback(() => {
    if (!actorId || projects.length === 0) {
      setState({ status: 'ready', rows: [], error: null });
      return;
    }
    setState({ status: 'loading', rows: [], error: null });
    loadContractorWorkspaceRows(projects, reports, { id: actorId, role: actorRole })
      .then(rows => setState({ status: 'ready', rows, error: null }))
      .catch(error => setState({ status: 'error', rows: [], error }));
  }, [projects, reports, actorId, actorRole]);

  // Genuine async data fetch (network I/O via loadContractorWorkspaceRows),
  // same shape App.jsx's loadProjects() effect already uses.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { ...state, reload: load };
}
