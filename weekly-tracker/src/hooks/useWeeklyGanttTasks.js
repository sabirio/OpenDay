import { useCallback, useEffect, useState } from 'react';
import { loadWeeklyGanttTasks, saveWeeklyGanttDates } from '../core/weekly/weeklyGanttSchedule.js';

export function useWeeklyGanttTasks({ showGantt, projectId }) {
  // `result.key` tracks which projectId the current `tasks` actually belong
  // to — "loading" is derived from key !== projectId rather than a separate
  // boolean toggled synchronously inside the effect (avoids an extra
  // cascading render before the fetch even starts, and means a project
  // switch can never show the *previous* project's tasks mislabeled as
  // current — the old effect's `alive` guard already prevented a stale
  // write, but now there is no separate loading/tasks pair that could
  // momentarily disagree).
  const [result, setResult] = useState({ key: null, tasks: [] });

  useEffect(() => {
    if (!showGantt || !projectId) return;

    let alive = true;
    loadWeeklyGanttTasks(projectId)
      .then(nextTasks => {
        if (alive) setResult({ key: projectId, tasks: nextTasks });
      })
      .catch(() => {
        if (alive) setResult({ key: projectId, tasks: [] });
      });

    return () => { alive = false; };
  }, [showGantt, projectId]);

  const loading = !!showGantt && !!projectId && result.key !== projectId;
  const tasks = result.key === projectId ? result.tasks : [];

  const resizeTask = useCallback(async (wpId, { plannedStart, plannedEnd, durationDays }) => {
    setResult(prev => ({
      ...prev,
      tasks: prev.tasks.map(task =>
        task.id === wpId
          ? { ...task, earlyStart: new Date(plannedStart), earlyFinish: new Date(plannedEnd), duration_days: durationDays }
          : task
      ),
    }));
    await saveWeeklyGanttDates(projectId, wpId, { plannedStart, plannedEnd, durationDays });
  }, [projectId]);

  return { tasks, loading, resizeTask };
}
