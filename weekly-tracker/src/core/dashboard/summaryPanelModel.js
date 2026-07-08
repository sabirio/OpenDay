import { computePortfolioAnalytics } from '../../engines/portfolioEngine.js';

export function buildDashboardSummaryPanelModel(rows = [], allRows = []) {
  const analytics = rows.length > 0 ? computePortfolioAnalytics(rows) : null;
  const scheduleCounts = {
    onTrack:   0,
    atRisk:    0,
    delayed:   0,
    critical:  0,
    noReport:  0,
  };

  for (const row of allRows) {
    const status = row.latestReport?.projectScheduleStatus;
    if (!row.latestReport) scheduleCounts.noReport++;
    else if (status === 'On Track') scheduleCounts.onTrack++;
    else if (status === 'At Risk') scheduleCounts.atRisk++;
    else if (status === 'Delayed') scheduleCounts.delayed++;
    else if (status === 'Critical') scheduleCounts.critical++;
  }

  return {
    analytics,
    donutCounts: {
      'On Track': scheduleCounts.onTrack,
      'At Risk':  scheduleCounts.atRisk,
      'Delayed':  scheduleCounts.delayed,
      'Critical': scheduleCounts.critical,
      null:       scheduleCounts.noReport,
    },
    donutTotal: allRows.length,
  };
}
