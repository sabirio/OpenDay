import { WORK_PACKAGES, WP_STATUS_SCORES, computePackageProgress } from '../config/workPackages';
import { computeProjectRiskScore, getRiskLevel } from './riskEngine';

// WP task comparison (mirrors SiteVisitReport comparisonResult)
function wpCompare(pmStatus, gcStatus) {
  if (!pmStatus) return 'not-assessed';
  if (!gcStatus) return 'no-gc';
  if (pmStatus === 'Not Applicable' || gcStatus === 'Not Applicable') return 'na';
  const ps = WP_STATUS_SCORES[pmStatus] ?? 0;
  const gs = WP_STATUS_SCORES[gcStatus] ?? 0;
  if (ps === gs) return 'match';
  return ps < gs ? 'discrepancy' : 'pm-higher';
}

function getGCStatus(gcReport, wpId, taskName) {
  if (!gcReport) return null;
  const e = gcReport.workPackageStatuses?.[wpId]?.[taskName];
  return e != null ? (e.status || null) : null;
}

/**
 * Compute a high-level project summary for the detail drawer.
 * Returns: { contractor, pmVisit, risk, opening }
 */
export function computeProjectSummary(project, projReports, projSiteVisits, progress, wpCumulativeStatuses) {
  const now = new Date();

  // ── 1. Contractor Report ──────────────────────────────────────────────────
  const sorted = [...projReports].sort(
    (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
  );
  const latest = sorted[sorted.length - 1] || null;
  const daysSinceReport = latest
    ? Math.floor((now - new Date(latest.reportingDate || latest.submittedAt)) / 86400000)
    : null;
  const missingReport = !latest || (daysSinceReport !== null && daysSinceReport > 7);

  const phaseProgress = wpCumulativeStatuses?.workPackageStatuses
    ? WORK_PACKAGES.map(wp => ({
        wpId: wp.id, name: wp.name, color: wp.color,
        pct: computePackageProgress(wpCumulativeStatuses.workPackageStatuses, wp.id),
      }))
    : [];

  const contractor = {
    scheduleStatus:  latest?.projectScheduleStatus || null,
    lastReportDate:  latest?.reportingDate || latest?.submittedAt || null,
    overallProgress: progress,
    daysSinceReport,
    missingReport,
    blocked:         latest?.activitiesBlocked === 'Yes',
    reportCount:     projReports.length,
    phaseProgress,
  };

  // ── 2. PM Site Visit ──────────────────────────────────────────────────────
  const visits = [...(projSiteVisits || [])].sort(
    (a, b) => new Date(b.visitDate || b.submittedAt) - new Date(a.visitDate || a.submittedAt)
  );
  const latestVisit = visits[0] || null;

  let pmVisit = {
    hasVisit: false, visitCount: 0, latestVisitDate: null,
    assessed: 0, matches: 0, discrepancies: 0, pmAhead: 0, notAssessed: 0,
    pmScheduleAssessment: null, matchRate: null,
  };

  if (latestVisit) {
    const visitDate = new Date(latestVisit.visitDate || latestVisit.submittedAt);
    const gcRef = sorted.filter(r => new Date(r.reportingDate || r.submittedAt) <= visitDate).slice(-1)[0] || latest;

    let assessed = 0, matches = 0, discrepancies = 0, pmAhead = 0, notAssessed = 0;
    if (latestVisit.pmWorkPackageStatuses) {
      for (const wp of WORK_PACKAGES) {
        for (const task of wp.tasks) {
          const pmStatus = latestVisit.pmWorkPackageStatuses[wp.id]?.[task.name]?.observedStatus || null;
          const gcStatus = getGCStatus(gcRef, wp.id, task.name);
          if (!pmStatus && !gcStatus) continue;
          const cmp = wpCompare(pmStatus, gcStatus);
          if (cmp === 'not-assessed') { notAssessed++; continue; }
          if (cmp === 'na') continue;
          assessed++;
          if (cmp === 'match') matches++;
          else if (cmp === 'discrepancy') discrepancies++;
          else if (cmp === 'pm-higher') pmAhead++;
        }
      }
    }

    pmVisit = {
      hasVisit: true, visitCount: visits.length,
      latestVisitDate: latestVisit.visitDate || latestVisit.submittedAt,
      assessed, matches, discrepancies, pmAhead, notAssessed,
      pmScheduleAssessment: latestVisit.pmScheduleAssessment || null,
      matchRate: assessed > 0 ? Math.round((matches / assessed) * 100) : null,
    };
  }

  // ── 3. Risk ───────────────────────────────────────────────────────────────
  const riskScore = computeProjectRiskScore(project, projReports, progress, projSiteVisits || []);
  const riskLevel = getRiskLevel(riskScore.score);

  const sched = latest?.projectScheduleStatus;
  const scheduleRisk =
    sched === 'Critical' ? 'CRITICAL' :
    sched === 'Delayed'  ? 'HIGH'     :
    sched === 'At Risk'  ? 'AT_RISK'  : 'OK';

  // ── 4. Opening ────────────────────────────────────────────────────────────
  const daysToOpening = project.targetOpeningDate
    ? Math.ceil((new Date(project.targetOpeningDate) - now) / 86400000)
    : null;

  const openingStatus =
    daysToOpening === null                            ? 'No Date'  :
    daysToOpening < 0                                 ? 'Overdue'  :
    daysToOpening < 30 && progress < 70               ? 'Critical' :
    daysToOpening < 60 && progress < 85               ? 'At Risk'  :
    'Ready';

  const risk = {
    level: riskLevel,
    score: riskScore.score,
    scheduleRisk,
    openingStatus,
    discrepancyStatus: pmVisit.hasVisit
      ? (pmVisit.discrepancies > 0 ? 'HAS_DISCREPANCIES' : 'OK')
      : 'NO_VISIT',
    missingReport,
    supportRequired: latest?.supportRequired === 'Yes',
    additionalWorks: latest?.additionalWorks === 'Yes',
    blocked: contractor.blocked,
  };

  const opening = {
    daysToOpening,
    status: openingStatus,
    targetDate: project.targetOpeningDate || null,
    blockerCount: riskScore.factors.filter(
      f => f.name === 'Activities blocked' || f.name === 'Repeated blocker'
    ).length,
  };

  return { contractor, pmVisit, risk, opening };
}
