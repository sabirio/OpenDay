import { computePortfolioAlerts, computePortfolioKpis } from '../../engines/portfolioEngine.js';
import { getCommands } from '../../engines/commandEngine.js';
import { buildHomeInsights, summarizeInsights } from '../insights/selectors/homeInsights.js';

export function buildHomeDashboardModel({ projects, reports, rows, ganttMetrics }) {
  const ganttRows = rows.map(row => ({ ...row, gantt: ganttMetrics.get(row.project.id) || null }));
  const alerts = computePortfolioAlerts(ganttRows);

  const commands = rows.flatMap(({ project, riskScore, readiness, latestReport, missingReport, progressComparison, prevProgressComparison }) =>
    getCommands({
      project,
      progressComparison,
      prevProgressComparison,
      riskScore,
      openingReadiness: readiness,
      latestReport,
      missingReport,
    })
  );

  const kpis = computePortfolioKpis(projects, rows, reports);
  const insights = buildHomeInsights({ rows, alerts, commands, projects });
  const summary = summarizeInsights(insights);

  return { alerts, commands, kpis, insights, summary };
}
