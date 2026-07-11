import { useMemo } from 'react';
import { buildWeeklyReportReviewModel } from '../core/weekly/weeklyReportReviewModel.js';

export function useWeeklyReportReviewModel(input) {
  const {
    selectedProject, selectedReport, prevReport, projectReports,
    siteVisits, overallProgress, activeTemplate, legacyWorkPackages, canonicalResult,
  } = input;

  // Deliberately reads/depends on these 9 fields individually rather than
  // the whole `input` object — buildWeeklyReportReviewModel's parameter
  // list is exactly these 9, confirmed by reading its signature, so
  // reconstructing the same shape here is safe and avoids recomputing on
  // every render when callers construct a fresh `input` object literal
  // (as this one's caller does) even though none of the relevant fields
  // actually changed.
  return useMemo(
    () => buildWeeklyReportReviewModel({
      selectedProject, selectedReport, prevReport, projectReports,
      siteVisits, overallProgress, activeTemplate, legacyWorkPackages, canonicalResult,
    }),
    [selectedProject, selectedReport, prevReport, projectReports,
      siteVisits, overallProgress, activeTemplate, legacyWorkPackages, canonicalResult]
  );
}
