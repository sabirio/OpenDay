// Pure site-visit aggregations: PM observation vs GC report comparisons.
// Each function is stateless: in → out, nothing stored.

import { WORK_PACKAGES } from '../config/workPackages';
import { svCompare, getGCStatusForTask, CONSTRUCTION_ITEMS, TESTING_ITEMS, HANDOVER_ITEMS } from '../config/dashboardConstants';
import { getWPById, getPhaseById } from '../config/masterTaskLibrary';
import { classifyDiscrepancy } from './discrepancyEngine';

const SV_STATUS_LABEL = {
  not_started: 'Not started', in_progress: 'In progress',
  completed: 'Completed', delayed: 'Delayed', blocked: 'Blocked',
};
const SV_RESULT_STYLE = {
  match:       { badge: '✓ Match',       type: 'match',       color: 'var(--status-done)',  bg: 'var(--status-done-bg)',  border: 'var(--border)' },
  discrepancy: { badge: '⚠ Discrepancy', type: 'discrepancy', color: 'var(--status-alert)', bg: 'var(--status-alert-bg)', border: 'var(--border)' },
  'pm-higher': { badge: '↑ PM ahead',    type: 'pm-higher',   color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' },
};

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

    // ── Gantt-format visit: visit.wps is the site_visit_wps rows loaded by getAll()
    if (visit.wps && visit.wps.length > 0) {
      const STATUS_RANK = { completed: 2, in_progress: 1, not_started: 0, delayed: -1, blocked: -2 };
      for (const wp of visit.wps) {
        // Skip tasks GC hasn't filled
        if ((wp.gc_status ?? 'not_started') === 'not_started' && Math.abs(wp.discrepancy_delta ?? 0) === 0) continue;

        const delta    = wp.discrepancy_delta ?? 0;
        const pmStatus = wp.observed_status  ?? 'not_started';
        const gcStatus = wp.gc_status        ?? 'not_started';
        const pmRank   = STATUS_RANK[pmStatus] ?? 0;
        const gcRank   = STATUS_RANK[gcStatus] ?? 0;
        const { type: resultType } = classifyDiscrepancy({ pmRank, gcRank, delta });

        const wpDef    = getWPById(wp.wp_id);
        const phaseDef = getPhaseById(wp.phase_id);
        items.push({
          phase:      phaseDef?.label || wp.phase_id || 'Phase',
          label:      wpDef?.label    || wp.wp_id    || 'Task',
          pm:         SV_STATUS_LABEL[pmStatus] ?? pmStatus,
          gc:         SV_STATUS_LABEL[gcStatus] ?? gcStatus,
          gcProgress: wp.gc_progress ?? null,
          pmProgress: wp.observed_progress ?? null,
          delta:      delta,
          note:       wp.pm_note || null,
          result:     SV_RESULT_STYLE[resultType],
        });
      }
    }
    // ── Old WP-status format (weekly reports)
    else if (visit.pmWorkPackageStatuses) {
      for (const wp of WORK_PACKAGES) {
        for (const task of wp.tasks) {
          const pmEntry  = visit.pmWorkPackageStatuses[wp.id]?.[task.name];
          const pmStatus = pmEntry?.observedStatus || null;
          const gcStatus = getGCStatusForTask(gcReport, wp.id, task.name);
          if (pmStatus || gcStatus)
            items.push({ phase: wp.name, label: task.name, pm: pmStatus, gc: gcStatus, result: svCompare(pmStatus, gcStatus) });
        }
      }
    }
    // ── Oldest format (flat demolitionStatus / constructionStatuses / etc.)
    else {
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

    const assessed      = items.filter(i => i.result && i.result.type !== "no-gc" && i.result.type !== "not-assessed");
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
