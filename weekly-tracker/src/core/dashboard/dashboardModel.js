import { computePortfolioAlerts, computeContractorPerf, computePortfolioKpis } from '../../engines/portfolioEngine';
import { computeSiteVisitData, computeSiteVisitKpis } from '../../engines/siteVisitEngine';
import { getProgressSnapshot } from '../../services/projectService';

export { getProgressSnapshot };

/**
 * Composes every engine-derived value Dashboard.jsx's various views need
 * from the same (projects, reports, siteVisits, allRows, ganttMetrics)
 * inputs — single source of truth for the gantt-enriched rows every other
 * derived value (alerts, SPI cards) reads from.
 */
export function buildDashboardModel({ projects, reports, siteVisits, allRows, ganttMetrics }) {
  const kpis = computePortfolioKpis(projects, allRows, reports);

  const ganttEnrichedRows = allRows.map(row => ({ ...row, gantt: ganttMetrics.get(row.project.id) || null }));

  const spiRows = ganttEnrichedRows.map(row => ({
    evm: row.gantt?.spi != null ? { SPI: row.gantt.spi } : null,
    monteCarlo: null,
  }));

  // Unified alert source — SPI alerts are PART of computePortfolioAlerts
  // output when gantt data is present (type: 'spi' items, worst-SPI first
  // within CRITICAL/HIGH tier).
  const alerts = computePortfolioAlerts(ganttEnrichedRows);

  const contractorPerf = computeContractorPerf(allRows);

  const svData = computeSiteVisitData(siteVisits, projects, reports);
  const svKpis = computeSiteVisitKpis(svData);

  return { kpis, ganttEnrichedRows, spiRows, alerts, contractorPerf, svData, svKpis };
}
