import { useMemo } from 'react';
import { buildDashboardModel } from '../core/dashboard/dashboardModel.js';

export function useDashboardModel({ projects, reports, siteVisits, allRows, ganttMetrics }) {
  return useMemo(
    () => buildDashboardModel({ projects, reports, siteVisits, allRows, ganttMetrics }),
    [projects, reports, siteVisits, allRows, ganttMetrics]
  );
}
