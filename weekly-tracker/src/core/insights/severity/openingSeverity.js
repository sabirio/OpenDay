import { isBadScheduleStatus } from '../../../utils/reportUtils.js';

/**
 * Shared "does this project's opening-readiness reflect risk?" predicates —
 * single source of truth for both the Home dashboard's KPI cards
 * (portfolioEngine.computePortfolioKpis) and the Priorities Today /
 * commandEngine "opening_at_risk" command.
 *
 * Before this file existed, the two answered visibly different questions
 * under the same labels: the AT RISK/CRITICAL cards only looked at the
 * self-reported weekly projectScheduleStatus and the aggregate riskLevel,
 * while Priorities looked at computeOpeningReadiness()'s blocker-based
 * status. A project reporting "On Track" with a LOW aggregate risk score
 * (riskEngine's "Opening not achievable" factor only fires once
 * readiness.verdict === 'NOT_ACHIEVABLE', a stricter bar than
 * readiness.status === 'At Risk') could show 0/0 on the cards while
 * Priorities correctly flagged it with named critical blockers — same
 * screen, contradictory "is anything wrong?" answers. Both now read this
 * one status ladder.
 *
 * openingReadiness.status severity ladder (openingReadinessEngine.js):
 *   'No Date' | 'Ready'     -> healthy
 *   'At Risk'               -> warning-level concern
 *   'Critical' | 'Overdue'  -> critical-level concern
 */

const AT_RISK_STATUSES  = ['At Risk', 'Critical', 'Overdue'];
const CRITICAL_STATUSES = ['Critical', 'Overdue'];

/** @param {{status?: string}|null|undefined} readiness */
export function isOpeningAtRisk(readiness) {
  return AT_RISK_STATUSES.includes(readiness?.status);
}

/** @param {{status?: string}|null|undefined} readiness */
export function isOpeningCritical(readiness) {
  return CRITICAL_STATUSES.includes(readiness?.status);
}

/**
 * A project counts toward the AT RISK card if its self-reported weekly
 * status is bad, OR its computed opening-readiness is at-risk-or-worse.
 * @param {{latestReport?: {projectScheduleStatus?: string}|null, readiness?: {status?: string}|null}} row
 */
export function isProjectAtRisk(row) {
  return isBadScheduleStatus(row.latestReport?.projectScheduleStatus) || isOpeningAtRisk(row.readiness);
}

/**
 * A project counts toward the CRITICAL card if its aggregate risk score
 * classified it CRITICAL, OR its opening-readiness reached Critical/Overdue.
 * @param {{riskLevel?: string, readiness?: {status?: string}|null}} row
 */
export function isProjectCritical(row) {
  return row.riskLevel === 'CRITICAL' || isOpeningCritical(row.readiness);
}
