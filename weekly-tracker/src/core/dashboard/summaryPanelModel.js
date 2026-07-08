import { computePortfolioAnalytics } from '../../engines/portfolioEngine.js';
import { SCHEDULE_STATUS } from '../../utils/reportUtils.js';

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
    else if (status === SCHEDULE_STATUS.ON_TRACK) scheduleCounts.onTrack++;
    else if (status === SCHEDULE_STATUS.AT_RISK) scheduleCounts.atRisk++;
    else if (status === SCHEDULE_STATUS.DELAYED) scheduleCounts.delayed++;
    else if (status === SCHEDULE_STATUS.CRITICAL) scheduleCounts.critical++;
  }

  return {
    analytics,
    donutCounts: {
      [SCHEDULE_STATUS.ON_TRACK]: scheduleCounts.onTrack,
      [SCHEDULE_STATUS.AT_RISK]:  scheduleCounts.atRisk,
      [SCHEDULE_STATUS.DELAYED]:  scheduleCounts.delayed,
      [SCHEDULE_STATUS.CRITICAL]: scheduleCounts.critical,
      null:       scheduleCounts.noReport,
    },
    donutTotal: allRows.length,
  };
}
