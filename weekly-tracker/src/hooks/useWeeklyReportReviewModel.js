import { useMemo } from 'react';
import { buildWeeklyReportReviewModel } from '../core/weekly/weeklyReportReviewModel.js';

export function useWeeklyReportReviewModel(input) {
  return useMemo(
    () => buildWeeklyReportReviewModel(input),
    [
      input.selectedProject,
      input.selectedReport,
      input.prevReport,
      input.projectReports,
      input.siteVisits,
      input.overallProgress,
      input.activeTemplate,
      input.legacyWorkPackages,
    ]
  );
}
