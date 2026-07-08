import { useEffect, useState } from 'react';
import { loadProjectAuditLog } from '../core/auditLog/auditLogModel.js';

export function useProjectAuditLog(projectId) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!projectId) {
      setLogs([]);
      setLoading(false);
      setError(null);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);
    loadProjectAuditLog(projectId)
      .then(rows => { if (alive) setLogs(rows); })
      .catch(err => { if (alive) setError(err?.message || 'Failed to load audit log'); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [projectId]);

  return { logs, loading, error };
}
