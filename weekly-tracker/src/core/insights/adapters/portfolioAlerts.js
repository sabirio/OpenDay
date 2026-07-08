import { RISK_LEVELS } from '../../../engines/riskEngine.js';

/**
 * Map computePortfolioAlerts output → Insight[].
 *
 * @param {Array<{sev:string, pid:string, reason:string, detail:string, action:string}>} alerts
 * @returns {import('../insight.js').Insight[]}
 */
export function alertsToInsights(alerts) {
  return alerts.map(a => ({
    id:                `portfolio:${a.pid}:${a.reason}`,
    source:            'portfolio',
    severity:          a.sev === RISK_LEVELS.CRITICAL ? 'critical' : a.sev === RISK_LEVELS.HIGH ? 'warning' : 'info',
    scope:             'project',
    projectId:         a.pid,
    title:             a.code ? `${a.code} — ${a.reason}` : a.reason,
    detail:            a.detail,
    recommendedAction: a.action,
    priorityScore:     a.sev === RISK_LEVELS.CRITICAL ? 0 : a.sev === RISK_LEVELS.HIGH ? 1 : 2,
  }));
}
