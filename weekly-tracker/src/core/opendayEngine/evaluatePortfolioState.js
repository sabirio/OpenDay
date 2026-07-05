/**
 * evaluatePortfolioState — composes portfolio-level derived state from rows
 * already produced by evaluateProjectState (one row per project).
 *
 * P1.2: this fixes a concrete inconsistency found while auditing Dashboard.jsx
 * vs RiskDashboard.jsx — Dashboard manually merges gantt metrics
 * (ganttService.loadAllGanttMetrics) into its rows before computing portfolio
 * alerts, RiskDashboard never merges them into rows at all. Both pages should
 * go through this one function so "portfolio state" means the same thing
 * everywhere. Pass `ganttMetricsMap` when available (it's optional/lazy on
 * some pages) and every row gets `row.gantt` attached the same way.
 *
 * @see types.js for the PortfolioState shape.
 */
import { computePortfolioKpis, computePortfolioAlerts, computeContractorPerf } from '../../engines/portfolioEngine';

/**
 * @param {Array} projects
 * @param {Array} rows — output of useAllRows / evaluateProjectState, one per project
 * @param {Array} allReports — full reports list (needed by computePortfolioKpis)
 * @param {object} [options]
 * @param {Map<number|string, object>|null} [options.ganttMetricsMap] — from ganttService.loadAllGanttMetrics()
 * @returns {import('./types.js').PortfolioState}
 */
export function evaluatePortfolioState(projects, rows, allReports, options = {}) {
  const { ganttMetricsMap = null } = options;

  const enrichedRows = ganttMetricsMap
    ? rows.map(row => ({ ...row, gantt: ganttMetricsMap.get(row.project.id) || null }))
    : rows;

  const kpis           = computePortfolioKpis(projects, enrichedRows, allReports);
  const alerts         = computePortfolioAlerts(enrichedRows);
  const contractorPerf = computeContractorPerf(enrichedRows);

  return { rows: enrichedRows, kpis, alerts, contractorPerf };
}
