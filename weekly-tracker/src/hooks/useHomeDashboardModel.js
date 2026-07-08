import { useMemo } from 'react';
import { buildHomeDashboardModel } from '../core/home/homeDashboardModel.js';

export function useHomeDashboardModel({ projects, reports, rows, ganttMetrics }) {
  return useMemo(
    () => buildHomeDashboardModel({ projects, reports, rows, ganttMetrics }),
    [projects, reports, rows, ganttMetrics]
  );
}
