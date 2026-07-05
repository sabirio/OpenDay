import { constructionRetailV1 } from "../domains/construction/templates/constructionRetailV1";
import { daysUntil } from "../utils/reportUtils";
import { sortReasons } from "../utils/reasonUtils";

// Flat WP list across all phases (canonical source — Wave 4.5).
const ALL_WPS = constructionRetailV1.phases.flatMap(phase =>
  phase.workPackages.map(wp => ({ ...wp, phaseId: phase.id }))
);

// Derived from constructionRetailV1 WP[].openingBlocker — no hardcoded strings.
// To change which WPs are blockers, update the openingBlocker flag in
// constructionRetailV1.js (Wave 4.5 — see TEMPLATE_MODEL.md).
//
// Keyed by phaseId (not wp.id): wpCumulativeStatuses.workPackageStatuses is a
// { [phaseId]: { [wpLabel]: {status,progress} } } map (see mergeGanttWPStatuses
// in reportUtils.js) — wp.id (e.g. "test.electrical") never appears as a key
// there, only phase ids (e.g. "testing") do.
function buildBlockerMap(level) {
  const map = {};
  for (const wp of ALL_WPS) {
    if (wp.openingBlocker !== level) continue;
    if (!map[wp.phaseId]) map[wp.phaseId] = [];
    map[wp.phaseId].push(wp.label);
  }
  return map;
}

const CRITICAL_BLOCKERS = buildBlockerMap('critical');
const SOFT_BLOCKERS     = buildBlockerMap('soft');

function getTaskStatus(wpStatuses, wpId, taskName) {
  return wpStatuses?.[wpId]?.[taskName]?.status || null;
}

function isBlocking(status) {
  if (!status || status === 'Not Applicable') return false;
  return status !== 'Completed';
}

/**
 * Compute opening readiness from latest cumulative WP statuses.
 *
 * @param {object|null}  wpCumulativeStatuses  - merged workPackageStatuses object
 * @param {string|null}  targetOpeningDate     - ISO date string
 * @returns {{
 *   status: 'No Date' | 'Ready' | 'At Risk' | 'Critical' | 'Overdue',
 *   daysToOpening: number | null,
 *   targetDate: string | null,
 *   criticalBlockers: Array<{ wpId, task, status }>,
 *   softBlockers: Array<{ wpId, task, status }>,
 *   blockerCount: number,
 * }}
 */
export function computeOpeningReadiness(wpCumulativeStatuses, targetOpeningDate) {
  const targetDate = targetOpeningDate || null;

  const daysToOpening = targetDate ? daysUntil(targetDate) : null;

  const wpStatuses = wpCumulativeStatuses?.workPackageStatuses ?? wpCumulativeStatuses ?? null;

  // Gather blocker lists
  const criticalBlockers = [];
  const softBlockers = [];

  for (const [wpId, tasks] of Object.entries(CRITICAL_BLOCKERS)) {
    for (const taskName of tasks) {
      const status = getTaskStatus(wpStatuses, wpId, taskName);
      if (isBlocking(status)) {
        criticalBlockers.push({ wpId, task: taskName, status: status || 'Not Started' });
      }
    }
  }

  for (const [wpId, tasks] of Object.entries(SOFT_BLOCKERS)) {
    for (const taskName of tasks) {
      const status = getTaskStatus(wpStatuses, wpId, taskName);
      if (isBlocking(status)) {
        softBlockers.push({ wpId, task: taskName, status: status || 'Not Started' });
      }
    }
  }

  // Determine status
  let status;

  if (daysToOpening === null) {
    status = 'No Date';
  } else if (daysToOpening < 0) {
    status = 'Overdue';
  } else if (criticalBlockers.length > 0 && daysToOpening < 60) {
    status = 'Critical';
  } else if ((criticalBlockers.length > 0 || softBlockers.length > 2) && daysToOpening < 90) {
    status = 'At Risk';
  } else if (criticalBlockers.length > 0 || softBlockers.length > 0) {
    // Blockers exist but opening is far enough away — still flag At Risk
    status = daysToOpening < 120 ? 'At Risk' : 'Ready';
  } else {
    status = 'Ready';
  }

  const reasons = [];

  if (status === 'No Date') {
    reasons.push({ type: 'neutral', text: 'No target opening date set', source: 'schedule' });
  } else if (status === 'Overdue') {
    reasons.push({ type: 'critical', text: `Opening date overdue by ${Math.abs(daysToOpening)}d`, source: 'schedule' });
  } else if (status === 'Critical') {
    reasons.push({ type: 'critical', text: `Critical opening: ${daysToOpening}d remaining`, source: 'schedule' });
  } else if (status === 'At Risk') {
    reasons.push({ type: 'warning', text: `Opening date at risk — ${daysToOpening}d remaining`, source: 'schedule' });
  } else {
    reasons.push({ type: 'positive', text: `Opening on track — ${daysToOpening}d remaining`, source: 'schedule' });
  }

  for (const b of criticalBlockers) {
    reasons.push({ type: 'critical', text: `Blocker: ${b.task} (${b.status})`, source: 'blocker' });
  }
  for (const b of softBlockers) {
    reasons.push({ type: 'warning', text: `Soft blocker: ${b.task} (${b.status})`, source: 'blocker' });
  }
  if (criticalBlockers.length === 0 && softBlockers.length === 0 && status !== 'No Date') {
    reasons.push({ type: 'positive', text: 'No critical path blockers', source: 'blocker' });
  }

  return {
    status,
    daysToOpening,
    targetDate,
    criticalBlockers,
    softBlockers,
    blockerCount: criticalBlockers.length + softBlockers.length,
    reasons: sortReasons(reasons),
  };
}
