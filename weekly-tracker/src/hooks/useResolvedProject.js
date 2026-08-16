import { useEffect, useMemo, useState } from 'react';
import { getProjectById } from './useProjectEditorOrchestration.js';

export function useResolvedProject(projects, projectId) {
  const listed = useMemo(() => (projects || []).find(item => String(item.id) === String(projectId)), [projects, projectId]);
  const [fallback, setFallback] = useState(null);
  useEffect(() => {
    let alive = true;
    if (listed) {
      return () => { alive = false; };
    }
    getProjectById(projectId).then(value => { if (alive) setFallback(value); }).catch(() => { if (alive) setFallback(false); });
    return () => { alive = false; };
  }, [listed, projectId]);
  return listed || fallback;
}
