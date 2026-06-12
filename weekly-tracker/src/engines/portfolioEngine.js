// Pure portfolio-level aggregations over pre-computed project rows.
// Each function is stateless: in → out, nothing stored.

import { estimateProgressFromStatuses, computeCumulativeStatuses, DAY_MS, isMissingReport, isBadScheduleStatus } from '../utils/reportUtils';
import { WORK_PACKAGES } from '../config/workPackages';
import { svCompare, getGCStatusForTask, CONSTRUCTION_ITEMS, TESTING_ITEMS, HANDOVER_ITEMS } from '../config/dashboardConstants';

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };

/**
 * Build the PM alert list from a portfolio of project rows.
 * @param {Array} rows - allRows from Dashboard (each with project, latestReport, progress, daysToOpening, daysSinceReport, riskLevel)
 * @returns {Array} alerts sorted by severity
 */
export function computePortfolioAlerts(rows) {
  const list = [];
  rows.forEach(({ project, latestReport, progress, daysToOpening, riskLevel }) => {
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
  });
  return list.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
}

/**
 * Aggregate contractor performance across a portfolio of project rows.
 * @param {Array} rows - allRows from Dashboard (each with project, latestReport, progress, projReports, missingReport)
 * @returns {Array} one entry per contractor, sorted by risk severity
 */
export function computeContractorPerf(rows) {
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
 * Portfolio KPI summary for the Dashboard header cards.
 * @param {Array} projects
 * @param {Array} allRows - pre-computed allRows (with riskLevel, missingReport, daysToOpening, progress, latestReport)
 * @param {Array} allReports - all raw reports (for reportsThisWeek count)
 */
export function computePortfolioKpis(projects, allRows, allReports) {
  const active   = projects.filter(p => p.projectStatus === "Active").length;
  const atRisk   = allRows.filter(({ latestReport }) => isBadScheduleStatus(latestReport?.projectScheduleStatus)).length;
  const critical = allRows.filter(({ riskLevel }) => riskLevel === "CRITICAL").length;
  const missing  = allRows.filter(({ missingReport }) => missingReport).length;
  const blocked  = allRows.filter(({ latestReport }) => latestReport?.activitiesBlocked === "Yes").length;
  const support  = allRows.filter(({ latestReport }) => latestReport?.supportRequired === "Yes").length;
  const avgProgress = allRows.length ? Math.round(allRows.reduce((s, { progress }) => s + progress, 0) / allRows.length) : 0;
  const weekAgo  = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const reportsThisWeek = allReports.filter(r => new Date(r.reportingDate || r.submittedAt) >= weekAgo).length;
  const openingSoon = allRows.filter(({ daysToOpening }) => daysToOpening !== null && daysToOpening >= 0 && daysToOpening < 30).length;
  return { active, total: projects.length, atRisk, critical, missing, blocked, support, avgProgress, reportsThisWeek, openingSoon };
}

/**
 * Missing-report summary for the Weekly Reports page.
 * Recomputes minimal row data from raw projects + reports.
 */
export function computePortfolioMissing(projects, reports) {
  const now  = new Date();
  const rows = projects.map(p => {
    const pReports  = reports.filter(r => String(r.projectId) === String(p.id));
    const latest    = [...pReports].sort((a, b) => new Date(b.reportingDate || b.submittedAt) - new Date(a.reportingDate || a.submittedAt))[0];
    const daysSince = latest ? Math.floor((now - new Date(latest.reportingDate || latest.submittedAt).getTime()) / DAY_MS) : null;
    const isMissing = isMissingReport(latest);
    const progress  = estimateProgressFromStatuses(computeCumulativeStatuses(pReports));
    return { project: p, latestReport: latest, daysSinceReport: daysSince, isMissing, progress };
  });
  const missing = rows.filter(r => r.isMissing);
  const blocked = rows.filter(r => r.latestReport?.activitiesBlocked === "Yes").length;
  const support = rows.filter(r => r.latestReport?.supportRequired === "Yes").length;
  const avgProgress = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.progress, 0) / rows.length) : 0;
  return { missingCount: missing.length, missing, blocked, support, avgProgress };
}

/**
 * Build per-visit comparison data (PM observed vs GC reported).
 * @param {Array} siteVisits
 * @param {Array} projects
 * @param {Array} reports
 */
export function computeSiteVisitData(siteVisits, projects, reports) {
  return siteVisits.map(visit => {
    const project        = projects.find(p => String(p.id) === String(visit.projectId));
    const projectReports = reports.filter(r => String(r.projectId) === String(visit.projectId));
    const sortedReports  = [...projectReports].sort((a, b) => new Date(b.reportingDate || b.submittedAt) - new Date(a.reportingDate || a.submittedAt));
    const gcReport = (visit.referenceReportId
      ? projectReports.find(r => String(r.id) === String(visit.referenceReportId))
      : null) || sortedReports[0] || null;

    const items = [];
    if (visit.pmWorkPackageStatuses) {
      for (const wp of WORK_PACKAGES) {
        for (const task of wp.tasks) {
          const pmEntry  = visit.pmWorkPackageStatuses[wp.id]?.[task.name];
          const pmStatus = pmEntry?.observedStatus || null;
          const gcStatus = getGCStatusForTask(gcReport, wp.id, task.name);
          if (pmStatus || gcStatus)
            items.push({ phase: wp.name, label: task.name, pm: pmStatus, gc: gcStatus, result: svCompare(pmStatus, gcStatus) });
        }
      }
    } else {
      const demoResult = svCompare(visit.demolitionStatus, gcReport?.demolitionStatus);
      if (visit.demolitionStatus || gcReport?.demolitionStatus)
        items.push({ phase: "Demolition", label: "Demolition", pm: visit.demolitionStatus, gc: gcReport?.demolitionStatus, result: demoResult });
      CONSTRUCTION_ITEMS.forEach(key => {
        const pm = visit.constructionStatuses?.[key], gc = gcReport?.constructionStatuses?.[key];
        if (pm || gc) items.push({ phase: "Construction", label: key, pm, gc, result: svCompare(pm, gc) });
      });
      TESTING_ITEMS.forEach(key => {
        const pm = visit.testingStatuses?.[key], gc = gcReport?.testingStatuses?.[key];
        if (pm || gc) items.push({ phase: "Testing", label: key, pm, gc, result: svCompare(pm, gc) });
      });
      HANDOVER_ITEMS.forEach(key => {
        const pm = visit.handoverStatuses?.[key], gc = gcReport?.handoverStatuses?.[key];
        if (pm || gc) items.push({ phase: "Handover", label: key, pm, gc, result: svCompare(pm, gc) });
      });
    }

    const assessed      = items.filter(i => i.result && i.result.type !== "not-assessed" && i.result.type !== "no-gc");
    const matches       = assessed.filter(i => i.result?.type === "match").length;
    const discrepancies = assessed.filter(i => i.result?.type === "discrepancy").length;
    const pmAhead       = assessed.filter(i => i.result?.type === "pm-higher").length;
    const matchRate     = assessed.length > 0 ? Math.round(matches / assessed.length * 100) : null;
    return { visit, project, gcReport, items, assessed: assessed.length, matches, discrepancies, pmAhead, matchRate };
  }).sort((a, b) => new Date(b.visit.visitDate || b.visit.submittedAt) - new Date(a.visit.visitDate || a.visit.submittedAt));
}

/**
 * Aggregate portfolio-level site visit KPIs from computeSiteVisitData output.
 */
export function computeSiteVisitKpis(svData) {
  const totalAssessed      = svData.reduce((s, d) => s + d.assessed, 0);
  const totalMatches       = svData.reduce((s, d) => s + d.matches, 0);
  const totalDiscrepancies = svData.reduce((s, d) => s + d.discrepancies, 0);
  const totalPmAhead       = svData.reduce((s, d) => s + d.pmAhead, 0);
  const overallMatchRate   = totalAssessed > 0 ? Math.round(totalMatches / totalAssessed * 100) : null;
  return { totalVisits: svData.length, totalAssessed, totalMatches, totalDiscrepancies, totalPmAhead, overallMatchRate };
}

/**
 * Risk-level breakdown + health/score summary for Risk Dashboard header.
 * @param {Array} allRows - RiskDashboard allRows (each with riskScore, health, project)
 */
export function computeRiskSummaryStats(allRows) {
  const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  allRows.forEach(r => c[r.riskScore.level]++);
  const avgScore  = allRows.length ? Math.round(allRows.reduce((s, r) => s + r.riskScore.score, 0) / allRows.length) : 0;
  const avgHealth = allRows.length ? Math.round(allRows.reduce((s, r) => s + r.health.score, 0) / allRows.length) : 0;
  const now = new Date();
  const opening30  = allRows.filter(r => {
    const dTo = r.project.targetOpeningDate ? Math.ceil((new Date(r.project.targetOpeningDate) - now) / 86400000) : null;
    return dTo !== null && dTo >= 0 && dTo < 30;
  }).length;
  const pmMismatch = allRows.filter(r =>
    r.riskScore.factors.some(f => f.name === "PM Site Visit mismatch" || f.name === "Hidden risk (PM vs GC)")
  ).length;
  return { ...c, avgScore, avgHealth, opening30, pmMismatch };
}
