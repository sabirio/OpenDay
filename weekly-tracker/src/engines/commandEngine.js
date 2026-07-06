/**
 * commandEngine.js — the "what to do" brain.
 *
 * Does NOT recalculate anything. Consumes pre-computed outputs from:
 *   progressEngine.calculateProgressComparison  → progressComparison, prevProgressComparison
 *   riskEngine.computeProjectRiskScore          → riskScore
 *   openingReadinessEngine.computeOpeningReadiness → openingReadiness
 *   isMissingReport (reportUtils)               → missingReport
 *   latest report object                        → latestReport
 *
 * Signature: getCommands(projectState, config) → Command[]
 *
 * Command shape:
 *   { id, severity:'critical'|'warning'|'info', title, reason, action, projectCode }
 *
 * Output sorted: critical → warning → info.
 * All thresholds come from config (scheduleConfig.js), none hardcoded here.
 */

import { SCHEDULE_CONFIG } from '../config/scheduleConfig';
import { isOpeningAtRisk, isOpeningCritical, blockerTaskNames } from '../core/insights/severity/openingSeverity.js';

const SEV_ORDER = { critical: 0, warning: 1, info: 2 };

/**
 * Generate a prioritized command list for one project.
 *
 * @param {object} projectState
 *   project               — project row
 *   progressComparison    — output of calculateProgressComparison (current week)
 *   prevProgressComparison— output of calculateProgressComparison (previous week) or null
 *   riskScore             — output of computeProjectRiskScore
 *   openingReadiness      — output of computeOpeningReadiness
 *   latestReport          — latest report object or null
 *   missingReport         — boolean
 * @param {object} config   — defaults to SCHEDULE_CONFIG
 * @returns {Command[]}
 */
export function getCommands(projectState, _config = SCHEDULE_CONFIG) {
  const {
    project,
    progressComparison,
    prevProgressComparison,
    riskScore,
    openingReadiness,
    latestReport,
    missingReport,
  } = projectState;

  const code = project.storeCode || String(project.id);
  const commands = [];

  // ── 1. Behind schedule ────────────────────────────────────────────────────
  if (progressComparison?.scheduleStatus === 'behind') {
    const gap     = progressComparison.scheduleGap;          // negative number
    const prevGap = prevProgressComparison?.scheduleGap ?? null;
    const worsening = prevGap !== null && gap < prevGap;     // gap became more negative

    commands.push({
      id:          'behind_schedule',
      severity:    worsening ? 'critical' : 'warning',
      title:       `${code} is ${Math.abs(gap)}% behind plan`,
      reason:      `Actual ${progressComparison.actualPct}% vs expected ${progressComparison.expectedPct}%` +
                   (worsening ? ', gap worsened vs last week' : ''),
      action:      worsening
        ? 'Escalate to GC — request recovery plan'
        : 'Review schedule with GC',
      projectCode: code,
    });
  }

  // ── 2. High / critical risk ───────────────────────────────────────────────
  if (riskScore?.level === 'HIGH' || riskScore?.level === 'CRITICAL') {
    const topFactors = (riskScore.factors || [])
      .slice(0, 2)
      .map(f => `${f.name}: ${f.value}`)
      .join('; ');

    commands.push({
      id:          'high_risk',
      severity:    riskScore.level === 'CRITICAL' ? 'critical' : 'warning',
      title:       `${code} risk level: ${riskScore.level}`,
      reason:      topFactors || 'Multiple risk factors detected',
      action:      'Review risk register',
      projectCode: code,
    });
  }

  // ── 3. Opening date at risk ───────────────────────────────────────────────
  if (isOpeningAtRisk(openingReadiness)) {
    const { status, daysToOpening, criticalBlockers = [], softBlockers = [] } = openingReadiness;
    const blockerCount = criticalBlockers.length + softBlockers.length;
    const reason = blockerCount > 0
      ? `${criticalBlockers.length} critical + ${softBlockers.length} soft blockers remaining`
      : daysToOpening !== null
        ? daysToOpening < 0
          ? `${Math.abs(daysToOpening)}d overdue`
          : `${daysToOpening}d to opening`
        : `Status: ${status}`;

    commands.push({
      id:          'opening_at_risk',
      severity:    isOpeningCritical(openingReadiness) ? 'critical' : 'warning',
      title:       `${code} opening date at risk — ${status}`,
      reason,
      action:      'Confirm recovery plan / consider moving target date',
      projectCode: code,
      // Named blockers behind the count in `reason` — lets Priorities Today
      // expand this command to show which tasks, not just how many.
      criticalBlockerTasks: blockerTaskNames(criticalBlockers),
      softBlockerTasks:     blockerTaskNames(softBlockers),
    });
  }

  // ── 4. Missing report ─────────────────────────────────────────────────────
  if (missingReport) {
    const daysSince = latestReport
      ? Math.round((Date.now() - new Date(latestReport.reportingDate || latestReport.submittedAt)) / 86400000)
      : null;

    commands.push({
      id:          'missing_report',
      severity:    'warning',
      title:       `${code} — no report submitted this week`,
      reason:      daysSince !== null
        ? `Last report ${daysSince}d ago`
        : 'No reports ever submitted',
      action:      'Chase PM for weekly report',
      projectCode: code,
    });
  }

  // ── 5. Additional works pending approval ──────────────────────────────────
  if (latestReport?.additionalWorks === 'Yes') {
    commands.push({
      id:          'additional_works_pending',
      severity:    'info',
      title:       `${code} — additional works pending approval`,
      reason:      latestReport.additionalWorksDescription ||
                   (latestReport.additionalWorksParty
                     ? `Party: ${latestReport.additionalWorksParty}`
                     : 'Additional works flagged in latest report'),
      action:      'Approve / reject additional works',
      projectCode: code,
    });
  }

  // ── All clear ─────────────────────────────────────────────────────────────
  if (commands.length === 0) {
    return [{
      id:          'all_clear',
      severity:    'info',
      title:       `${code} — all clear`,
      reason:      'No schedule issues, risk flags, or blockers detected',
      action:      'No action required',
      projectCode: code,
    }];
  }

  return [...commands].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}
