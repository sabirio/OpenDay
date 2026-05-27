import { WP_STATUS_SCORES } from "../config/workPackages";

// Tasks that MUST be Completed before a store can open.
// Any of these in Not Started / In Progress / Delayed = blocker.
const CRITICAL_BLOCKERS = {
  commissioning: [
    'HVAC balancing & commissioning',
    'Electrical testing & certification',
    'Sprinkler testing & commissioning',
    'Fire alarm testing',
    'Integrated systems testing',
  ],
  handover: [
    'Defects & snagging resolution',
    'Final cleaning',
    'Certificates & warranties',
    'Authority approvals & permits',
  ],
};

// Tasks that should be done before opening but won't cause a hard 'Critical' on their own.
const SOFT_BLOCKERS = {
  commissioning: [
    'Security & access control testing',
    'IT & POS integration testing',
    'BMS commissioning',
  ],
  handover: [
    'Staff training',
    'O&M manuals',
  ],
};

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
  const now = new Date();
  const targetDate = targetOpeningDate || null;

  const daysToOpening = targetDate
    ? Math.ceil((new Date(targetDate) - now) / 86400000)
    : null;

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

  return {
    status,
    daysToOpening,
    targetDate,
    criticalBlockers,
    softBlockers,
    blockerCount: criticalBlockers.length + softBlockers.length,
  };
}
