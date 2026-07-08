import { useCallback, useEffect, useState } from 'react';
import { loadWeeklyGanttTasks, saveWeeklyGanttDates } from '../core/weekly/weeklyGanttSchedule.js';

export function useWeeklyGanttTasks({ showGantt, projectId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!showGantt || !projectId) return;

    let alive = true;
    setLoading(true);
    loadWeeklyGanttTasks(projectId)
      .then(nextTasks => {
        if (alive) setTasks(nextTasks);
      })
      .catch(() => {
        if (alive) setTasks([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [showGantt, projectId]);

  const resizeTask = useCallback(async (wpId, { plannedStart, plannedEnd, durationDays }) => {
    setTasks(prev => prev.map(task =>
      task.id === wpId
        ? { ...task, earlyStart: new Date(plannedStart), earlyFinish: new Date(plannedEnd), duration_days: durationDays }
        : task
    ));
    await saveWeeklyGanttDates(projectId, wpId, { plannedStart, plannedEnd, durationDays });
  }, [projectId]);

  return { tasks, loading, resizeTask };
}
