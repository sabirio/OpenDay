import { useEffect, useState } from 'react';
import { loadSubmissionSnapshot } from '../core/contractorSchedule/scheduleSubmissionOrchestration.js';
import { deriveScheduleCompleteness } from '../core/schedule/contractorScheduleLifecycle.js';

/**
 * Immutable per-WP snapshot for one selected submission (Simplification
 * Phase 4B.2) — loads only public.project_schedule_version_tasks (via the
 * orchestration layer), never the live/moving project_gantt_tasks Draft.
 * Reused by the Contractor's own submitted-schedule view, the PM Review
 * main panel, and submission history selection — one loader, one shape,
 * ready for GanttChart's readOnly mode.
 */
export function useScheduleVersionSnapshot({ projectId, versionId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(Boolean(versionId));
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!projectId || !versionId) { setTasks([]); setLoading(false); return undefined; }
    setLoading(true);
    setError(null);
    loadSubmissionSnapshot(projectId, versionId)
      .then((next) => { if (alive) setTasks(next); })
      .catch((err) => { if (alive) setError(err); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId, versionId]);

  return { tasks, loading, error, completeness: deriveScheduleCompleteness(tasks) };
}
