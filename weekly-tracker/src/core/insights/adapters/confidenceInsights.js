/**
 * confidenceInsights.js — emit a separate insight when data-absence is itself actionable.
 * Pure function — no engine imports.
 *
 * Rule (A — separate card):
 *   Emit ONE card per project when confidence.breakdown shows:
 *     - 'Report history'  earned = 0  (no reports ever submitted), OR
 *     - 'Report freshness' earned = 0  (no recent report / >14 days old)
 *
 * Cards sit at priorityScore 5 so they fall below real operational problems.
 *
 * Phase 3D.1: both dimensions collapse to the same root cause — no report
 * exists at all — whenever row.latestReport is null. For a CONTRACTOR_MANAGED
 * project with no schedule commitment yet (row.assessmentAvailability ===
 * 'NOT_ASSESSABLE'), that absence carries zero signal (NO COMMITMENT YET !=
 * COMMITMENT MISSED), so this specific combination is suppressed. A
 * genuinely stale REAL report (reports exist, latestReport is just old) is
 * unaffected and still surfaces regardless of commitment state — real
 * evidence is never suppressed by the commitment gate.
 *
 * @param {Array<{project: {id:string}, confidence: {breakdown: Array}, latestReport: object|null, assessmentAvailability?: string}>} rows
 * @returns {import('../insight.js').Insight[]}
 */
export function confidenceToInsights(rows) {
  const insights = [];
  for (const row of rows) {
    const { confidence, project } = row;
    if (!confidence || !project?.id) continue;

    const breakdown = confidence.breakdown ?? [];
    const reportHistory  = breakdown.find(b => b.dimension === 'Report history');
    const reportFreshness = breakdown.find(b => b.dimension === 'Report freshness');

    const suppressAbsenceSignal = row.assessmentAvailability === 'NOT_ASSESSABLE' && !row.latestReport;
    const noReports = reportHistory?.earned === 0 && !suppressAbsenceSignal;
    const stale     = reportFreshness?.earned === 0 && !suppressAbsenceSignal;

    if (!noReports && !stale) continue;

    const parts = [];
    if (noReports) parts.push(reportHistory.detail);
    if (stale)     parts.push(reportFreshness.detail);

    insights.push({
      id:                `confidence:${project.id}:data-absent`,
      source:            'confidence',
      severity:          'warning',
      scope:             'project',
      projectId:         project.id,
      title:             'Low data confidence',
      detail:            parts.join(' · '),
      recommendedAction: 'Request an updated report or schedule a site visit',
      priorityScore:     5,
    });
  }
  return insights;
}
