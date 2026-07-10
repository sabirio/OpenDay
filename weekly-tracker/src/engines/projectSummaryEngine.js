import { WORK_PACKAGES, WP_STATUS_SCORES, computePackageProgress } from '../config/workPackages';
import { getPhasesInOrder, WORK_PACKAGES as GANTT_WPS } from '../config/masterTaskLibrary';
import { getScopeWPIds } from '../core/projects/scope/getScopeWPIds';
import { DAY_MS, isMissingReport, SCHEDULE_STATUS } from '../utils/reportUtils';
import { calculatePhaseProgress } from './progressEngine';
import { computeProjectRiskScore, getRiskLevel } from './riskEngine';
import { classifyDiscrepancy } from './discrepancyEngine';
import { computeOpeningReadiness } from './openingReadinessEngine';
import { ALL_WORK_PACKAGES_V2, V2_TEMPLATE_TYPE } from '../domains/construction/templates/retailFitoutV2';
import { buildV2OpeningReadinessOptions } from '../core/projects/scope/buildV2OpeningReadinessOptions';

const GANTT_PHASE_COLORS = [
  '#6366f1','#0ea5e9','#10b981','#f59e0b','#8b5cf6',
  '#ec4899','#14b8a6','#f97316','#84cc16','#06b6d4','#a855f7',
];
const GANTT_PHASE_META = Object.fromEntries(
  getPhasesInOrder().map((p, i) => [p.id, { name: p.label, color: GANTT_PHASE_COLORS[i % GANTT_PHASE_COLORS.length] }])
);

function phaseProgressFromGanttStatuses(wpStatuses) {
  return getPhasesInOrder()
    .map(phase => {
      const { pct, count } = calculatePhaseProgress(phase.id, wpStatuses[phase.id] || {});
      if (count === 0) return null;
      const meta = GANTT_PHASE_META[phase.id] || { name: phase.label, color: 'var(--text-muted)' };
      return { wpId: phase.id, name: meta.name, color: meta.color, pct };
    })
    .filter(Boolean);
}

function resolveOpeningReadinessInputs(project) {
  const isV2 = project?.templateType === V2_TEMPLATE_TYPE;
  return {
    scopeWPIds: getScopeWPIds(project?.scope, isV2 ? ALL_WORK_PACKAGES_V2 : GANTT_WPS),
    templateOptions: isV2 ? buildV2OpeningReadinessOptions() : null,
  };
}

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
 * Human-readable label for a computeProjectSummary() risk.scheduleRisk
 * value ('OK'|'AT_RISK'|'HIGH'|'CRITICAL') — the exact inverse of the
 * scheduleRisk mapping above, single-sourced here so display code (e.g.
 * ProjectDetailDrawer.jsx) never re-derives its own copy of the mapping.
 */
export function getScheduleRiskLabel(scheduleRisk) {
  if (scheduleRisk === 'CRITICAL') return SCHEDULE_STATUS.CRITICAL;
  if (scheduleRisk === 'HIGH')     return SCHEDULE_STATUS.DELAYED;
  if (scheduleRisk === 'AT_RISK')  return SCHEDULE_STATUS.AT_RISK;
  return SCHEDULE_STATUS.ON_TRACK;
}

/**
 * Compute a high-level project summary for the detail drawer.
 * Returns: { contractor, pmVisit, risk, opening }
 */
export function computeProjectSummary(project, projReports, projSiteVisits, progress, wpCumulativeStatuses, referenceDate = new Date()) {
  const now = new Date(referenceDate);

  // ── 1. Contractor Report ──────────────────────────────────────────────────
  const sorted = [...projReports].sort(
    (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
  );
  const latest = sorted[sorted.length - 1] || null;
  const daysSinceReport = latest
    ? Math.floor((now - new Date(latest.reportingDate || latest.submittedAt).getTime()) / DAY_MS)
    : null;
  const missingReport = isMissingReport(latest, now);

  const phaseProgress = wpCumulativeStatuses?.workPackageStatuses
    ? (() => {
        const gantt = phaseProgressFromGanttStatuses(wpCumulativeStatuses.workPackageStatuses);
        // If any Gantt phase found, use Gantt data; else fall back to old WP format
        if (gantt.length > 0) return gantt;
        return WORK_PACKAGES.map(wp => ({
          wpId: wp.id, name: wp.name, color: wp.color,
          pct: computePackageProgress(wpCumulativeStatuses.workPackageStatuses, wp.id),
        }));
      })()
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

    let assessed = 0, matches = 0, discrepancies = 0, pmAhead = 0, notAssessed = 0;

    const wps = latestVisit.wps || [];
    if (wps.length > 0) {
      // Gantt-format visit: compute stats from site_visit_wps rows
      const hasLinkedReport = !!latestVisit.contractorReportId;
      for (const wp of wps) {
        if (!wp.observed_status || wp.observed_status === 'not_started') {
          notAssessed++;
          continue;
        }
        assessed++;

        if (!hasLinkedReport) {
          // No GC report linked — count all PM-observed WPs as confirmed
          matches++;
          continue;
        }

        const delta = wp.discrepancy_delta ?? 0;
        const { type } = classifyDiscrepancy({ delta });

        if      (type === 'pm-higher')    pmAhead++;
        else if (type === 'discrepancy')  discrepancies++;
        else                              matches++;
      }
    } else if (latestVisit.pmWorkPackageStatuses) {
      // Legacy format
      const gcRef = sorted.filter(r => new Date(r.reportingDate || r.submittedAt) <= visitDate).slice(-1)[0] || latest;
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
      pmScheduleAssessment: latestVisit.pmScheduleAssessment || latestVisit.pm_schedule_assessment || null,
      matchRate: assessed > 0 ? Math.round((matches / assessed) * 100) : null,
    };
  }

  // ── 3. Opening ────────────────────────────────────────────────────────────
  // Computed before Risk (below) so computeProjectRiskScore can read
  // readiness.verdict — matches evaluateProjectState.js's order (the A3
  // pattern). scopeWPIds must be passed here — without it, buildBlockerRecords()
  // (in openingReadinessEngine.js) checks blocker WPs against the FULL
  // canonical template regardless of this project's actual scope, flagging
  // any out-of-scope blocker (never reported on, so always "Not Started") as
  // still incomplete.
  const { scopeWPIds, templateOptions } = resolveOpeningReadinessInputs(project);
  const openingReadiness = computeOpeningReadiness(
    wpCumulativeStatuses,
    project.targetOpeningDate || null,
    scopeWPIds,
    templateOptions,
    now
  );
  const openingStatus = openingReadiness.status;

  // ── 4. Risk ───────────────────────────────────────────────────────────────
  // readiness passed as the 5th arg (F-02 fix) — without it, the "Opening not
  // achievable" +20pt factor (riskEngine.js) can never fire here, so this
  // drawer's risk.level/score could diverge from evaluateProjectState.js's
  // canonical Home/Dashboard value for the identical project.
  const riskScore = computeProjectRiskScore(project, projReports, progress, projSiteVisits || [], openingReadiness, now);
  const riskLevel = getRiskLevel(riskScore.score);

  const sched = latest?.projectScheduleStatus;
  const scheduleRisk =
    sched === SCHEDULE_STATUS.CRITICAL ? 'CRITICAL' :
    sched === SCHEDULE_STATUS.DELAYED  ? 'HIGH'     :
    sched === SCHEDULE_STATUS.AT_RISK  ? 'AT_RISK'  : 'OK';

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
    daysToOpening: openingReadiness.daysToOpening,
    status: openingStatus,
    targetDate: openingReadiness.targetDate,
    blockerCount: openingReadiness.blockerCount,
    criticalBlockers: openingReadiness.criticalBlockers,
    softBlockers: openingReadiness.softBlockers,
  };

  return { contractor, pmVisit, risk, opening };
}
