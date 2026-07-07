// @ts-check
// Pure portfolio-level aggregations over pre-computed project rows.
// Each function is stateless: in → out, nothing stored.

import { computeCumulativeStatuses, computeWPCumulativeStatuses, DAY_MS, isMissingReport, isBadScheduleStatus } from '../utils/reportUtils';
import { calculateProjectProgressResult } from './progressEngine';
import { isProjectAtRisk, isProjectCritical } from '../core/insights/severity/openingSeverity.js';

/** @typedef {import('../types').PortfolioKpis} PortfolioKpis */
/**
 * @typedef {object} Command
 * @property {'critical'|'warning'|'info'} severity
 */
/** @typedef {{project: Record<string, any>, latestReport: Record<string, any>|null, progress: number, daysToOpening: number|null, daysSinceReport: number|null, riskLevel: string, projReports?: Array<Record<string, any>>, missingReport?: boolean, gantt?: Record<string, any>|null}} PortfolioRow */

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };

/**
 * Build the PM alert list from a portfolio of project rows.
 * @param {PortfolioRow[]} rows - allRows from Dashboard (each with project, latestReport, progress, daysToOpening, daysSinceReport, riskLevel)
 * @returns {Array<Record<string, any>>} alerts sorted by severity
 */
export function computePortfolioAlerts(rows) {
  /** @type {Array<Record<string, any>>} */
  const list = [];
  rows.forEach(({ project, latestReport, progress, daysToOpening, riskLevel, gantt }) => {
    if (daysToOpening !== null && daysToOpening < 30 && progress < 80)
      list.push({ sev: "CRITICAL", pid: project.id, code: project.storeCode, mall: project.shoppingMallName, reason: "Opening approaching — low progress", detail: `${daysToOpening < 0 ? "OVERDUE" : daysToOpening + "d to open"} · Progress ${progress}%`, action: "Immediate escalation required" });
    if (latestReport?.activitiesBlocked === "Yes")
      list.push({ sev: "HIGH", pid: project.id, code: project.storeCode, mall: project.shoppingMallName, reason: "Activities blocked", detail: latestReport.delayReason || "Reason not specified", action: "PM intervention required" });
    if ((latestReport?.projectScheduleStatus === "At Risk" || latestReport?.projectScheduleStatus === "Delayed") && latestReport?.riskScale === "High")
      list.push({ sev: "HIGH", pid: project.id, code: project.storeCode, mall: project.shoppingMallName, reason: `${latestReport.projectScheduleStatus} + High risk scale`, detail: latestReport.riskDescription || "Review risk report", action: "Review mitigation plan" });
    if (latestReport?.projectScheduleStatus === "Delayed")
      list.push({ sev: "HIGH", pid: project.id, code: project.storeCode, mall: project.shoppingMallName, reason: "Project delayed", detail: latestReport.riskDescription || "Schedule confirmed delayed", action: "Review recovery plan" });
    if (riskLevel === "CRITICAL" && latestReport && !list.some(a => a.pid === project.id && a.sev === "CRITICAL"))
      list.push({ sev: "CRITICAL", pid: project.id, code: project.storeCode, mall: project.shoppingMallName, reason: "Project classified CRITICAL", detail: "Risk Level: CRITICAL", action: "Immediate PM review required" });
    // SPI schedule-performance alert — only when Gantt data is present and project is incomplete.
    // alertsToInsights ignores the extra spi/spiStatus/criticalTasksBehind fields; Dashboard
    // banner uses them directly via alerts.filter(a => a.type === 'spi').
    if (gantt?.spi != null &&
        (gantt.spiStatus === 'critical' || gantt.spiStatus === 'at_risk') &&
        progress < 100) {
      list.push({
        sev:                 gantt.spiStatus === 'critical' ? 'CRITICAL' : 'HIGH',
        pid:                 project.id,
        code:                project.storeCode,
        mall:                project.shoppingMallName,
        reason:              gantt.spiStatus === 'critical' ? 'SPI critical' : 'SPI at risk',
        detail:              `SPI ${gantt.spi.toFixed(2)} — schedule behind plan`,
        action:              'Review Gantt and contractor progress',
        type:                'spi',
        spi:                 gantt.spi,
        spiStatus:           gantt.spiStatus,
        criticalTasksBehind: gantt.criticalHealth?.behind ?? 0,
      });
    }
  });
  return list.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
}

/**
 * Aggregate contractor performance across a portfolio of project rows.
 * @param {PortfolioRow[]} rows - allRows from Dashboard (each with project, latestReport, progress, projReports, missingReport)
 * @returns {Array<Record<string, any>>} one entry per contractor, sorted by risk severity
 */
export function computeContractorPerf(rows) {
  /** @type {Record<string, {projects: string[], totalProg: number, atRisk: number, blockers: number, support: number, missing: number, reportCount: number}>} */
  const map = {};
  rows.forEach(({ project, latestReport, progress, projReports, missingReport }) => {
    const name = project.generalContractor || latestReport?.contractor || "Unknown";
    if (!map[name]) map[name] = { projects: [], totalProg: 0, atRisk: 0, blockers: 0, support: 0, missing: 0, reportCount: 0 };
    const c = map[name];
    c.projects.push(project.storeCode);
    c.totalProg += progress;
    if (isBadScheduleStatus(latestReport?.projectScheduleStatus)) c.atRisk++;
    if (latestReport?.activitiesBlocked === "Yes") c.blockers++;
    if (latestReport?.supportRequired === "Yes") c.support++;
    if (missingReport) c.missing++;
    c.reportCount += projReports.length;
  });
  return Object.entries(map).map(([name, d]) => ({
    name, n: d.projects.length, projects: d.projects,
    avgProg: d.projects.length ? Math.round(d.totalProg / d.projects.length) : 0,
    atRisk: d.atRisk, blockers: d.blockers, support: d.support, missing: d.missing, reportCount: d.reportCount,
  })).sort((a, b) => b.atRisk - a.atRisk || b.blockers - a.blockers || a.avgProg - b.avgProg);
}

/**
 * Portfolio-level EVM/Monte Carlo summary for SummaryPanel.jsx's analytics
 * strip: average SPI across every row with a computed SPI, and a count of
 * rows Monte Carlo flags as risky (<50% on-time probability, and not itself
 * flagged insufficient_data). Moved out of a local IIFE in the component
 * (architecture-conformance pass) — every input value (evm.SPI,
 * monteCarlo.pOnTime) is itself an engine output; this only aggregates them.
 *
 * @param {Array<{evm?: {SPI?: number|null}, monteCarlo?: {insufficient_data?: boolean, pOnTime?: number}}>} rows
 * @returns {{avgSPI: number|null, mcRiskyCount: number}}
 */
export function computePortfolioAnalytics(rows) {
  const evmRows = rows.filter(r => r.evm?.SPI != null);
  const avgSPI = evmRows.length
    ? Math.round((evmRows.reduce((s, r) => s + r.evm.SPI, 0) / evmRows.length) * 100) / 100
    : null;
  const mcRiskyCount = rows.filter(r => r.monteCarlo && !r.monteCarlo.insufficient_data && r.monteCarlo.pOnTime < 50).length;
  return { avgSPI, mcRiskyCount };
}

/**
 * Portfolio KPI summary for the Dashboard header cards.
 *
 * atRisk/critical are openingReadiness-aware (isProjectAtRisk/isProjectCritical,
 * shared with commandEngine.getCommands' "opening_at_risk" command) so these
 * cards never show 0 while Priorities Today is flagging the same project —
 * see core/insights/severity/openingSeverity.js for why the two used to disagree.
 *
 * @param {Array<Record<string, any>>} projects
 * @param {PortfolioRow[]} allRows - pre-computed allRows (with riskLevel, missingReport, daysToOpening, progress, latestReport, readiness)
 * @param {Array<Record<string, any>>} allReports - all raw reports (for reportsThisWeek count)
 * @returns {PortfolioKpis}
 */
export function computePortfolioKpis(projects, allRows, allReports) {
  const active   = projects.filter(p => p.projectStatus === "Active").length;
  const atRisk   = allRows.filter(isProjectAtRisk).length;
  const critical = allRows.filter(isProjectCritical).length;
  const missing  = allRows.filter(({ missingReport }) => missingReport).length;
  const blocked  = allRows.filter(({ latestReport }) => latestReport?.activitiesBlocked === "Yes").length;
  const support  = allRows.filter(({ latestReport }) => latestReport?.supportRequired === "Yes").length;
  const newOpening = projects.filter(p => p.projectType === "New Opening").length;
  const rebuilding = projects.filter(p => p.projectType === "Rebuilding").length;
  const avgProgress = allRows.length ? Math.round(allRows.reduce((s, { progress }) => s + progress, 0) / allRows.length) : 0;
  const weekAgo  = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const reportsThisWeek = allReports.filter(r => new Date(r.reportingDate || r.submittedAt) >= weekAgo).length;
  const openingSoon = allRows.filter(({ daysToOpening }) => daysToOpening !== null && daysToOpening >= 0 && daysToOpening < 30).length;
  return {
    active,
    total: projects.length,
    atRisk,
    critical,
    missing,
    blocked,
    support,
    newOpening,
    rebuilding,
    avgProgress,
    reportsThisWeek,
    openingSoon,
  };
}

/**
 * Missing-report summary for the Weekly Reports page.
 * Recomputes minimal row data from raw projects + reports.
 * @param {Array<Record<string, any>>} projects
 * @param {Array<Record<string, any>>} reports
 * @returns {{missingCount: number, missing: Array<Record<string, any>>, blocked: number, support: number, avgProgress: number}}
 */
export function computePortfolioMissing(projects, reports) {
  const now  = new Date();
  const rows = projects.map(p => {
    const pReports  = reports.filter(r => String(r.projectId) === String(p.id));
    const latest    = [...pReports].sort((a, b) => new Date(b.reportingDate || b.submittedAt).getTime() - new Date(a.reportingDate || a.submittedAt).getTime())[0];
    const daysSince = latest ? Math.floor((now.getTime() - new Date(latest.reportingDate || latest.submittedAt).getTime()) / DAY_MS) : null;
    const isMissing = isMissingReport(latest);
    const wpCum     = computeWPCumulativeStatuses(pReports);
    const legCum    = computeCumulativeStatuses(pReports);
    const progress  = calculateProjectProgressResult(wpCum, legCum).progress;
    return { project: p, latestReport: latest, daysSinceReport: daysSince, isMissing, progress };
  });
  const missing = rows.filter(r => r.isMissing);
  const blocked = rows.filter(r => r.latestReport?.activitiesBlocked === "Yes").length;
  const support = rows.filter(r => r.latestReport?.supportRequired === "Yes").length;
  const avgProgress = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.progress, 0) / rows.length) : 0;
  return { missingCount: missing.length, missing, blocked, support, avgProgress };
}
