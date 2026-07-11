import { useEffect, useState } from 'react';
import { loadProjectAuditLog } from '../core/auditLog/auditLogModel.js';

export function useProjectAuditLog(projectId) {
  // `result.key` tracks which projectId `logs`/`error` actually belong to —
  // "loading" is derived (key !== projectId) instead of a separate boolean
  // set synchronously at the top of the effect. When projectId is falsy,
  // that's reflected directly in the derived values below rather than via
  // an early-return branch that itself called setState.
  const [result, setResult] = useState({ key: undefined, logs: [], error: null });

  useEffect(() => {
    if (!projectId) return;

    let alive = true;
    loadProjectAuditLog(projectId)
      .then(rows => { if (alive) setResult({ key: projectId, logs: rows, error: null }); })
      .catch(err => { if (alive) setResult({ key: projectId, logs: [], error: err?.message || 'Failed to load audit log' }); });

    return () => { alive = false; };
  }, [projectId]);

  const loading = !!projectId && result.key !== projectId;
  const logs = !projectId ? [] : result.key === projectId ? result.logs : [];
  const error = !projectId ? null : result.key === projectId ? result.error : null;

  return { logs, loading, error };
}
