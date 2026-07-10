import { computeWPObservationDiscrepancy } from '../../engines/discrepancyEngine';
import {
  submitSiteVisitAtomic,
} from '../../services/siteVisitService';
import { createClientRequestId, normalizeWriteError, validateUniqueWPItems } from '../write/writeCommand.js';

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
  const clientRequestId = meta.clientRequestId || createClientRequestId();
  validateUniqueWPItems(wpObservationsArray, 'site visit');
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
      wpId:               w.wpId,
      observed_progress:  pmProgress,
      observed_status:    w.observed_status || 'not_started',
      pm_note:            w.pm_note         || null,
      discrepancy_status: discStatus,
      discrepancy_delta:  signedDelta,
      gc_status:          gcStatus,
      gc_progress:        gcProgress,
      signed_delta:       signedDelta,
      absolute_delta:     absDelta,
    };
  });
  try {
    const result = await submitSiteVisitAtomic(projectId, contractorReportId, observationRows, {
      ...meta,
      clientRequestId,
      calculatedAt: meta.calculatedAt || new Date().toISOString(),
      calculationVersion: 'openday-canonical-core/1',
    });
    return { siteVisit: result?.siteVisit, discrepancies: result?.discrepancies || discrepancies, idempotentReplay: result?.idempotentReplay === true };
  } catch (error) {
    throw normalizeWriteError(error, 'site_visit.submit', clientRequestId);
  }
}
