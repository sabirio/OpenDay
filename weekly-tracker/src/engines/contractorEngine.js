import { computeCumulativeStatuses, computeWPCumulativeStatuses, DAY_MS, isBadScheduleStatus, isSevereScheduleStatus } from "../utils/reportUtils";
import { calculateProjectProgressResult } from "./progressEngine";
import { computePmAlignmentItems, summarizeAlignmentItems } from "./pmAlignmentEngine";
import { computeScheduleDeviation } from "./riskEngine";
import { resolveProjectScopeSelection } from "../core/projects/scope/getScopeWPIds";
import { WORK_PACKAGES as GANTT_WPS } from "../config/masterTaskLibrary";
import { V2_TEMPLATE_TYPE } from "../domains/construction/templates/retailFitoutV2";
import { resolveProjectScopeTemplate } from "../domains/construction/templates/versionedScopeTemplate.js";
import { resolveProjectProgressTemplate } from "../core/projects/weights/resolveProjectProgressTemplate.js";
import { resolveEffectiveV2ZoneAreas } from "../core/projects/areas/resolveProjectArea";

export function computeContractorScores(project, projReports, projSiteVisits, referenceDate = new Date()) {
  if (!projReports.length) {
    return { totalScore: 50, performanceScore: 50, pmAlignmentScore: 50, breakdown: { reporting: 10, pmAlignment: 15, progress: 12, issues: 8, communication: 5 }, pmAlignmentDetails: [] };
  }
  const sorted = [...projReports].sort((a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt));
  const latest = sorted[sorted.length - 1];

  // 1. Reporting Discipline (0-20)
  let reportingPts = 20;
  const gapPenalty = sorted.slice(1).reduce((pen, r, i) => {
    const gap = (new Date(r.reportingDate || r.submittedAt) - new Date(sorted[i].reportingDate || sorted[i].submittedAt)) / DAY_MS;
    return pen + (gap > 21 ? 6 : gap > 14 ? 3 : 0);
  }, 0);
  reportingPts -= Math.min(8, gapPenalty);
  if (!latest.nextWeekTop3 && !latest.lookAheadNotes) reportingPts -= 4;
  if ((latest.risks || []).filter(Boolean).length > 0 && !latest.riskDescription) reportingPts -= 3;
  if (!(latest.photos || []).length) reportingPts -= 3;
  reportingPts = Math.max(0, Math.round(reportingPts));

  // 2. PM Verification Alignment (0-30)
  let pmAlignmentPts = 25;
  const pmAlignmentDetails = [];
  if (projSiteVisits && projSiteVisits.length > 0) {
    pmAlignmentPts = 30;
    const visitsSorted = [...projSiteVisits].sort((a, b) => new Date(b.visitDate || b.submittedAt) - new Date(a.visitDate || a.submittedAt));
    visitsSorted.slice(0, 3).forEach(visit => {
      const visitDate = new Date(visit.visitDate || visit.submittedAt);
      const gcAtVisit = sorted.filter(r => new Date(r.reportingDate || r.submittedAt) <= visitDate).slice(-1)[0] || sorted[sorted.length - 1];
      const items = computePmAlignmentItems(gcAtVisit, visit);
      const { matchRate, overstatements: overstateItems } = summarizeAlignmentItems(items);
      pmAlignmentDetails.push({ visitDate: visit.visitDate || visit.submittedAt, matchRate, overstatements: overstateItems.length, total: items.length, items });
      items.forEach(item => {
        if (item.severity === "CRITICAL" || item.severity === "HIGH") pmAlignmentPts -= 4;
        else if (item.severity === "MEDIUM") pmAlignmentPts -= 1;
      });
      const pmSevere = isSevereScheduleStatus(visit.pmScheduleAssessment);
      const pmBadV   = pmSevere || isBadScheduleStatus(visit.pmScheduleAssessment);
      const gcGoodV  = gcAtVisit.projectScheduleStatus === "On Track";
      const gcAtRiskV = gcAtVisit.projectScheduleStatus === "At Risk";
      if (pmBadV && gcGoodV) pmAlignmentPts -= pmSevere ? 7 : 5;
      else if (pmSevere && gcAtRiskV) pmAlignmentPts -= 3;
    });
    pmAlignmentPts = Math.max(0, Math.round(pmAlignmentPts));
  }

  // 3. Contractor-Controlled Progress (0-25): penalise only when behind expected.
  // Engine-audit fix (2026-07-16): previously called with no scopeWPIds/template/
  // phaseWeightOverrides at all, silently using the full default template's
  // weights regardless of this project's actual scope or v2 zone areas — not a
  // pinned-custom-v1-template resolution (that needs templatesById, unavailable
  // here), but scope/v2/weightOverrides are all resolvable from `project` alone.
  const isV2 = project?.templateType === V2_TEMPLATE_TYPE;
  const scopeTemplate = resolveProjectScopeTemplate(project);
  const schemaVersion = isV2 ? scopeTemplate?.data?.schemaVersion : undefined;
  const scopeWPIds = resolveProjectScopeSelection({
    scope: project?.scope,
    workPackages: isV2 ? scopeTemplate.workPackages : GANTT_WPS,
    schemaVersion,
  });
  const v2Template = isV2
    ? resolveProjectProgressTemplate({
        scopeTemplate,
        zoneAreas: resolveEffectiveV2ZoneAreas(project),
        activeZoneIds: project?.scope?.zones ?? null,
        activeCategoryIds: project?.scope?.categories ?? null,
      })
    : null;
  const wpCum  = computeWPCumulativeStatuses(projReports);
  const legCum = computeCumulativeStatuses(projReports) || {};
  const gcProgress = calculateProjectProgressResult(wpCum, legCum, scopeWPIds, v2Template, project?.scope?.weightOverrides ?? null).progress;
  const schedDev = computeScheduleDeviation(project, gcProgress, referenceDate);
  let progressPts;
  if (!schedDev) {
    progressPts = 15;
  } else {
    const dev = schedDev.deviationPct;
    progressPts = dev <= 0 ? 25 : dev <= 5 ? 22 : dev <= 10 ? 18 : dev <= 20 ? 12 : dev <= 30 ? 6 : 2;
  }
  progressPts = Math.min(25, Math.max(0, progressPts));

  // 4. Issue Management (0-15)
  let issuePts = 15;
  const blockerHistory = sorted.filter(r => r.activitiesBlocked === "Yes");
  if (blockerHistory.length >= 3) issuePts -= 6;
  else if (blockerHistory.length >= 2) issuePts -= 3;
  const risksWithoutMit = sorted.filter(r => (r.risks || []).filter(Boolean).length > 0 && !r.riskDescription).length;
  issuePts -= Math.min(5, risksWithoutMit * 2);
  issuePts = Math.max(0, Math.round(issuePts));

  // 5. Communication Quality (0-10)
  let commPts = 10;
  if (!latest.nextWeekTop3 && !latest.lookAheadNotes) commPts -= 4;
  if (!latest.finalComments && !latest.pendingIssues) commPts -= 2;
  if (latest.supportRequired === "Yes" && !latest.supportDescription && !(latest.supportTypes || []).length) commPts -= 2;
  if (!(latest.photos || []).length) commPts -= 2;
  commPts = Math.max(0, Math.round(commPts));

  const totalScore = Math.min(100, reportingPts + pmAlignmentPts + progressPts + issuePts + commPts);
  const performanceScore = Math.min(100, Math.round(((reportingPts + progressPts + issuePts + commPts) / 70) * 100));
  const pmAlignmentScore = Math.min(100, Math.round((pmAlignmentPts / 30) * 100));

  return { totalScore, performanceScore, pmAlignmentScore, breakdown: { reporting: reportingPts, pmAlignment: pmAlignmentPts, progress: progressPts, issues: issuePts, communication: commPts }, pmAlignmentDetails };
}

export function computePortfolioContractorScores(allRows) {
  const map = {};
  allRows.forEach(({ project, contScore, projReports, latestReport }) => {
    const name = project.generalContractor || latestReport?.contractor || "Unknown";
    if (!map[name]) map[name] = { projects: [], totalPerf: 0, totalAccuracy: 0, totalScore: 0, reportCount: 0 };
    const c = map[name];
    c.projects.push(project.storeCode);
    c.totalPerf += contScore.performanceScore;
    c.totalAccuracy += contScore.pmAlignmentScore;
    c.totalScore += contScore.totalScore;
    c.reportCount += projReports.length;
  });
  return Object.entries(map).map(([name, d]) => {
    const n = d.projects.length;
    const avgPerf     = Math.round(d.totalPerf / n);
    const avgAccuracy = Math.round(d.totalAccuracy / n);
    const avgTotal    = Math.round(d.totalScore / n);
    const perfColor   = avgPerf >= 80 ? "var(--status-done)" : avgPerf >= 60 ? "var(--status-warn)" : "var(--status-alert)";
    const accColor    = avgAccuracy >= 80 ? "var(--status-done)" : avgAccuracy >= 60 ? "var(--status-warn)" : "var(--status-alert)";
    const perfLevel   = avgPerf >= 80 ? "Reliable" : avgPerf >= 60 ? "Moderate" : "Needs Attention";
    const accLevel    = avgAccuracy >= 80 ? "Accurate" : avgAccuracy >= 60 ? "Moderate" : "Unreliable";
    return { name, avgTotal, avgPerf, avgAccuracy, perfColor, accColor, perfLevel, accLevel, projects: d.projects, n, reportCount: d.reportCount };
  }).sort((a, b) => a.avgTotal - b.avgTotal);
}
