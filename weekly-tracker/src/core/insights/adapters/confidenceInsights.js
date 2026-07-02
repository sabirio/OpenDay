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
 * @param {Array<{project: {id:string}, confidence: {breakdown: Array}}>} rows
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

    const noReports = reportHistory?.earned === 0;
    const stale     = reportFreshness?.earned === 0;

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
