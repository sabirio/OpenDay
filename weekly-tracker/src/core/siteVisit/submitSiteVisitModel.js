import { computeWPObservationDiscrepancy } from '../../engines/discrepancyEngine';
import {
  getCurrentUserId,
  insertSiteVisitHeader,
  insertSiteVisitWPObservations,
  insertSiteVisitDiscrepancies,
} from '../../services/siteVisitService';
import { updateGanttDiscrepancy } from '../../services/ganttService';

/**
 * Submit a PM site visit with per-WP observations: computes each WP's
 * discrepancy against the GC's claimed progress/status, persists the visit
 * header + observations + discrepancy summary, then reflects the
 * discrepancy fields back onto project_gantt_tasks.
 *
 * @param {string} projectId
 * @param {string|null} contractorReportId — links visit to a specific report
 * @param {Array<{ wpId, observed_progress, observed_status, pm_note }>} wpObservationsArray
 * @param {object} [meta] — { visitDate, overallNote }
 * @returns { siteVisit, discrepancies }
 */
export async function submitSiteVisitModel(projectId, contractorReportId, wpObservationsArray, meta = {}) {
  const visitedBy = meta.visitedBy || await getCurrentUserId();
  const siteVisit = await insertSiteVisitHeader(projectId, contractorReportId, visitedBy, meta);

  // gc_progress and gc_status are passed per-task from the caller (SiteVisitReport.jsx).
  const discrepancies = [];
  const observationRows = wpObservationsArray.map(w => {
    const { gcProgress, pmProgress, gcStatus, signedDelta, absDelta, discStatus } = computeWPObservationDiscrepancy(w);

    if (absDelta > 0) {
      discrepancies.push({
        wpId:                w.wpId,
        contractor_progress: gcProgress,
        site_visit_progress: pmProgress,
        delta:               absDelta,
        // P2.2: signedDelta preserves direction (negative = PM found LESS
        // than the contractor claimed, i.e. an overstatement; positive = PM
        // found MORE). `delta` above is abs-only, which loses this — needed
        // by GanttSuccessView to bucket "discrepancy" vs "PM ahead" without
        // re-deriving its own (and previously inconsistent) comparison.
        // Progress alone can't always tell direction either: when both sides
        // report 0% but disagree on status rank (e.g. not_started vs
        // blocked), site_visit_progress === contractor_progress === 0.
        signedDelta:         signedDelta,
        status:              discStatus,
      });
    }

    return {
      site_visit_id:      siteVisit.id,
      project_id:         projectId,
      wp_id:              w.wpId,
      observed_progress:  pmProgress,
      observed_status:    w.observed_status || 'not_started',
      pm_note:            w.pm_note         || null,
      discrepancy_status: discStatus,
      discrepancy_delta:  signedDelta,
      gc_status:          gcStatus,
    };
  });

  await insertSiteVisitWPObservations(observationRows);

  if (discrepancies.length > 0) {
    const discRows = discrepancies.map(d => ({
      site_visit_id:          siteVisit.id,
      project_id:             projectId,
      wp_id:                  d.wpId,
      contractor_progress:    d.contractor_progress,
      site_visit_progress:    d.site_visit_progress,
      delta:                  d.delta,
      status:                 d.status,
    }));
    await insertSiteVisitDiscrepancies(discRows);
  }

  for (const d of discrepancies) {
    await updateGanttDiscrepancy(projectId, d.wpId, {
      siteVisitProgress: d.site_visit_progress,
      discrepancyStatus: d.status,
      discrepancyDelta:  d.delta,
    }).catch(() => {}); // non-fatal
  }

  return { siteVisit, discrepancies };
}
