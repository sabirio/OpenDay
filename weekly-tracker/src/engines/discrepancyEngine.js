// Discrepancy Engine — compares contractor-reported progress vs PM site-visit observations.

/**
 * Severity of a discrepancy given an absolute or signed delta (pp).
 * Thresholds: |delta| > 25 → critical, >= 10 → warning, else ok.
 */
export function discrepancySeverity(delta) {
  const d = Math.abs(delta ?? 0);
  if (d > 25) return 'critical';
  if (d >= 10) return 'warning';
  return 'ok';
}

/**
 * Classify a PM-vs-GC comparison into match / discrepancy / pm-higher.
 *
 * @param {object} opts
 * @param {number|null} opts.pmRank   — numeric rank from STATUS_RANK (optional)
 * @param {number|null} opts.gcRank   — numeric rank from STATUS_RANK (optional)
 * @param {number}      opts.delta    — signed delta: positive = PM ahead, negative = GC overclaiming
 * @returns {{ type: 'match'|'discrepancy'|'pm-higher', severity: 'ok'|'warning'|'critical' }}
 */
export function classifyDiscrepancy({ pmRank = null, gcRank = null, delta = 0 }) {
  const rankDiff = pmRank != null && gcRank != null ? pmRank - gcRank : null;
  let type;
  if (rankDiff !== null) {
    if      (rankDiff === 0 && Math.abs(delta) <= 5) type = 'match';
    else if (rankDiff < 0 || delta < -5)             type = 'discrepancy';
    else                                             type = 'pm-higher';
  } else {
    if      (Math.abs(delta) <= 5) type = 'match';
    else if (delta < -5)           type = 'discrepancy';
    else                           type = 'pm-higher';
  }
  return { type, severity: discrepancySeverity(delta) };
}

// Delayed/Blocked rank below Not Started, so marking a task Delayed when GC
// claimed In Progress registers as a discrepancy even at 0% progress on both
// sides. Used by computeWPObservationDiscrepancy() below.
const STATUS_RANK = { completed: 2, in_progress: 1, not_started: 0, delayed: -1, blocked: -2 };

/**
 * Per-task PM-vs-GC discrepancy for a single site_visit_wps observation row.
 * This is the exact computation siteVisitService.submitSiteVisit() persists
 * to site_visit_wps.discrepancy_status/discrepancy_delta — extracted here
 * (P2.2) so it's testable without a Supabase client, and so
 * GanttSuccessView.jsx can read the persisted result instead of
 * recalculating with different thresholds (a real bug that produced a
 * different discrepancy count than what was actually saved).
 *
 * NOTE: uses its own >=20/>=10 thresholds, not discrepancySeverity()'s
 * >25/>=10 — these are two independently-tuned threshold schemes that
 * happen to coexist; not unified here to avoid changing either's persisted
 * behavior.
 *
 * @param {{gc_progress?, observed_progress?, gc_status?, observed_status?}} w
 * @returns {{gcProgress, pmProgress, gcStatus, signedDelta, absDelta, discStatus}}
 */
export function computeWPObservationDiscrepancy(w) {
  const gcProgress = w.gc_progress ?? 0;
  const pmProgress = w.observed_progress ?? 0;
  const gcStatus    = w.gc_status    ?? 'not_started';
  const pmStatus    = w.observed_status ?? gcStatus;

  const gcRank    = STATUS_RANK[gcStatus] ?? 0;
  const pmRank    = STATUS_RANK[pmStatus] ?? 0;
  const rankDelta = pmRank - gcRank;

  const progressDelta = pmProgress - gcProgress;
  const signedDelta = (pmProgress !== 0 || gcProgress !== 0)
    ? progressDelta
    : rankDelta * 10;
  const absDelta   = Math.abs(signedDelta);
  const discStatus = absDelta >= 20 ? 'critical' : absDelta >= 10 ? 'warning' : 'ok';

  return { gcProgress, pmProgress, gcStatus, signedDelta, absDelta, discStatus };
}

/**
 * Calculate discrepancies between contractor report WPs and site visit WPs.
 *
 * @param {Array<{ wpId, progress: number }>} contractorReportWPs
 * @param {Array<{ wpId, progress: number, pm_note?: string, visit_date?: string }>} siteVisitWPs
 * @returns Array of discrepancy objects
 */
export function calculateDiscrepancy(contractorReportWPs, siteVisitWPs) {
  const contractorMap = Object.fromEntries(
    contractorReportWPs.map(wp => [wp.wpId, wp])
  );
  const siteVisitMap = Object.fromEntries(
    siteVisitWPs.map(wp => [wp.wpId, wp])
  );

  const allWPIds = new Set([
    ...contractorReportWPs.map(w => w.wpId),
    ...siteVisitWPs.map(w => w.wpId),
  ]);

  const results = [];

  for (const wpId of allWPIds) {
    const contractor = contractorMap[wpId];
    const siteVisit = siteVisitMap[wpId];

    if (!contractor || !siteVisit) continue; // only compare where both have data

    const contractor_progress = contractor.progress ?? 0;
    const site_visit_progress = siteVisit.progress ?? 0;
    const delta = Math.abs(contractor_progress - site_visit_progress);
    const status = discrepancySeverity(delta);

    results.push({
      wpId,
      contractor_progress,
      site_visit_progress,
      delta,
      status,
      site_visit_date: siteVisit.visit_date || null,
      note: siteVisit.pm_note || null,
    });
  }

  return results;
}

/**
 * Get the latest discrepancies for a project.
 * Compares last contractor report vs last site visit (by date).
 *
 * @param {object[]} contractorReports  — array of reports, each with .wps array
 * @param {object[]} siteVisits         — array of visits, each with .wps array
 * @returns Array of discrepancy objects (empty if either is missing)
 */
export function getLatestDiscrepancies(contractorReports, siteVisits) {
  if (!contractorReports?.length || !siteVisits?.length) return [];

  const lastReport = [...contractorReports].sort(
    (a, b) => new Date(b.report_date || b.created_at) - new Date(a.report_date || a.created_at)
  )[0];

  const lastVisit = [...siteVisits].sort(
    (a, b) => new Date(b.visit_date || b.created_at) - new Date(a.visit_date || a.created_at)
  )[0];

  if (!lastReport?.wps || !lastVisit?.wps) return [];

  // Normalize WP arrays to { wpId, progress } format
  const contractorWPs = lastReport.wps.map(w => ({
    wpId:     w.wp_id || w.wpId,
    progress: w.progress_pct ?? w.progress ?? 0,
  }));

  const visitWPs = lastVisit.wps.map(w => ({
    wpId:       w.wp_id || w.wpId,
    progress:   w.observed_progress ?? w.progress ?? 0,
    pm_note:    w.pm_note || null,
    visit_date: lastVisit.visit_date,
  }));

  return calculateDiscrepancy(contractorWPs, visitWPs);
}

/**
 * Merge discrepancy data into a Gantt result array.
 * Attaches discrepancy info directly to WP objects for the layout engine.
 *
 * @param {object[]} ganttResult
 * @param {object[]} discrepancies  — from calculateDiscrepancy()
 * @returns Gantt result with discrepancy fields populated
 */
export function mergeDiscrepanciesIntoGantt(ganttResult, discrepancies) {
  const discMap = Object.fromEntries(discrepancies.map(d => [d.wpId, d]));
  return ganttResult.map(wp => ({
    ...wp,
    discrepancy: discMap[wp.id] || null,
  }));
}
