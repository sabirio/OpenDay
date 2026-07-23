import { useCallback, useEffect, useState } from 'react';
import { loadContractorWorkspaceRows } from '../core/contractorWorkspace/loadContractorWorkspaceRows.js';

const EMPTY_SUMMARY = { projectCount: 0, reportsNeedingActionCount: 0, openObservationsCount: 0, overdueObservationsCount: 0 };

/**
 * "My Work" for the Contractor Workspace — one row per assigned project with
 * report status and actionable-snag count, plus a summary derived from those
 * same rows. `actorId`/`actorRole` are passed as scalars (not a `user`
 * object) so the fetch only re-runs when identity actually changes, not on
 * every parent re-render.
 */
export function useContractorWorkspace(projects, reports, actorId, actorRole) {
  const [state, setState] = useState({ status: 'idle', rows: [], summary: EMPTY_SUMMARY, error: null });

  const load = useCallback(() => {
    if (!actorId || projects.length === 0) {
      setState({ status: 'ready', rows: [], summary: EMPTY_SUMMARY, error: null });
      return;
    }
    setState({ status: 'loading', rows: [], summary: EMPTY_SUMMARY, error: null });
    loadContractorWorkspaceRows(projects, reports, { id: actorId, role: actorRole })
      .then(({ rows, summary }) => setState({ status: 'ready', rows, summary, error: null }))
      .catch(error => setState({ status: 'error', rows: [], summary: EMPTY_SUMMARY, error }));
  }, [projects, reports, actorId, actorRole]);

  // Genuine async data fetch (network I/O via loadContractorWorkspaceRows),
  // same shape App.jsx's loadProjects() effect already uses.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { ...state, reload: load };
}
