/**
 * evaluateReportImpact — "what did this one contractor report change".
 *
 * Composes progressEngine + progressDeltaEngine calls that WeeklyReports.jsx
 * currently makes ad hoc, one per concern, at the report-detail level. Not
 * yet wired into WeeklyReports.jsx (P1.2 follow-up) — WeeklyReports has extra
 * legacy-format branching around this same data that needs its own careful
 * migration; this function exists so that migration lands on a tested,
 * single call instead of copy-pasted composition.
 *
 * @see types.js for the ReportImpact shape.
 */
import { calculateProgressComparison, computeProgressSeries } from '../../engines/progressEngine';
import { calculateWorkPackageDeltas, computePhaseChangeFlags, classifyPhases } from '../../engines/progressDeltaEngine';

/**
 * @param {object} project
 * @param {number} actualPct — the selected report's cumulative progress (0-100)
 * @param {Array} progressHistory — project.progressHistory rows
 * @param {Array} workPackages — WORK_PACKAGES or the scoped Gantt WP list for this project
 * @param {object} mergedStatuses — cumulative WP statuses as of the selected report date
 * @param {object|null} [prevMergedStatuses] — cumulative WP statuses as of the previous report date
 * @param {object} [options]
 * @param {object} [options.config] — SCHEDULE_CONFIG override
 * @param {Date|null} [options.referenceDate]
 * @param {Array|null} [options.scopePhaseIds]
 * @param {object|null} [options.phaseWeights]
 * @returns {import('./types.js').ReportImpact}
 */
export function evaluateReportImpact(
  project,
  actualPct,
  progressHistory,
  workPackages,
  mergedStatuses,
  prevMergedStatuses = null,
  options = {},
) {
  const { config, referenceDate = null, scopePhaseIds = null, phaseWeights = null } = options;

  const progressComparison = calculateProgressComparison(project, actualPct, progressHistory, config, referenceDate);
  const series             = computeProgressSeries(progressHistory);
  const wpDeltas           = calculateWorkPackageDeltas(mergedStatuses, prevMergedStatuses);
  const phaseChangeFlags   = computePhaseChangeFlags(wpDeltas);
  const phases             = classifyPhases(workPackages, mergedStatuses, prevMergedStatuses, scopePhaseIds, phaseWeights);

  return { progressComparison, series, wpDeltas, phaseChangeFlags, phases };
}
