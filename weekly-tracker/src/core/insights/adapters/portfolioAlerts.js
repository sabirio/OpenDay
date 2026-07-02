/**
 * Map computePortfolioAlerts output → Insight[].
 * Pure function — no engine imports.
 *
 * @param {Array<{sev:string, pid:string, reason:string, detail:string, action:string}>} alerts
 * @returns {import('../insight.js').Insight[]}
 */
export function alertsToInsights(alerts) {
  return alerts.map(a => ({
    id:                `portfolio:${a.pid}:${a.reason}`,
    source:            'portfolio',
    severity:          a.sev === 'CRITICAL' ? 'critical' : a.sev === 'HIGH' ? 'warning' : 'info',
    scope:             'project',
    projectId:         a.pid,
    title:             a.reason,
    detail:            a.detail,
    recommendedAction: a.action,
    priorityScore:     a.sev === 'CRITICAL' ? 0 : a.sev === 'HIGH' ? 1 : 2,
  }));
}
