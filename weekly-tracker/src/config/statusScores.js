/**
 * Format-agnostic WP task status vocabulary and scoring.
 *
 * Extracted from the legacy config/workPackages.js (P1.1): this status
 * vocabulary ('Not Started' | 'In Progress' | 'Completed' | 'Delayed' |
 * 'Not Applicable') and its 0-1 scoring are used to render/score BOTH
 * canonical Gantt-format work packages (masterTaskLibrary.js ids) and
 * legacy pre-Gantt work packages (workPackages.js ids) — the status
 * strings themselves never depended on which WP id vocabulary is in use.
 * Canonical modules should import from here, not from workPackages.js.
 */

export const WP_STATUS_OPTIONS = [
  'Not Applicable',
  'Not Started',
  'In Progress',
  'Completed',
];

export const WP_STATUS_SCORES = {
  'Not Started': 0,
  'In Progress': 0.5,
  Delayed: 0.3,
  Completed: 1,
  'Not Applicable': null,
};

export function getWPStatusScore(status) {
  return WP_STATUS_SCORES[status] ?? 0;
}

// Legacy display-status vocabulary -> canonical contractor_report_wps.status
// column vocabulary (snake_case, shared with the Gantt path). Inverse of
// adaptContractorReportToLegacy.js's STATUS_TO_LEGACY map. 'Not Applicable'
// has no DB equivalent — callers must exclude those entries before mapping,
// same as comparisonResult() already excludes them from comparison metrics.
const LEGACY_STATUS_TO_DB = {
  'Not Started': 'not_started',
  'In Progress': 'in_progress',
  Completed: 'completed',
};

export function legacyStatusToDbStatus(status) {
  return LEGACY_STATUS_TO_DB[status] || 'not_started';
}

export function compareWPTaskStatus(pmStatus, gcStatus) {
  if (!pmStatus || !gcStatus) return null;
  const pmScore = getWPStatusScore(pmStatus);
  const gcScore = getWPStatusScore(gcStatus);
  if (pmScore === gcScore) return 'match';
  if (pmScore > gcScore) return 'pm-higher';
  return 'gc-higher';
}
