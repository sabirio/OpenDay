/**
 * Linear time-interpolated expected schedule progress for a project.
 * expectedPct = clamp(round(elapsedDays / totalDays * 100), 0, 100)
 * Window = constructionStartDate → constructionEndDate (fallback targetOpeningDate).
 * Single source of truth — do not re-implement this formula anywhere else.
 */
export const DAY_MS = 86400000;

export function computeExpectedPct(project, referenceDate = new Date()) {
  if (!project) return null;
  const start = project.constructionStartDate ? new Date(project.constructionStartDate) : null;
  const end = project.constructionEndDate
    ? new Date(project.constructionEndDate)
    : project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (!start || !end || end <= start) return null;
  const totalDays   = Math.ceil((end - start) / DAY_MS);
  const elapsedDays = Math.max(0, Math.ceil((ref - start) / DAY_MS));
  return Math.min(100, Math.round((elapsedDays / totalDays) * 100));
}

/**
 * Converts an ISO-8601 week string (e.g. "2026-W27") to that week's Monday
 * (00:00 UTC). Single source of truth — services/projectService.js's
 * progress-snapshot query and Dashboard.jsx's week-picker label both derive
 * their date range from this (architecture-conformance pass: was duplicated
 * inline in both places).
 * @param {string} isoWeekStr
 * @returns {Date}
 */
export function isoWeekToMonday(isoWeekStr) {
  const [yearStr, weekStr] = isoWeekStr.split('-W');
  const year = parseInt(yearStr, 10), week = parseInt(weekStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  return new Date(jan4.getTime() - (jan4Day - 1) * DAY_MS + (week - 1) * 7 * DAY_MS);
}

/**
 * Current date's ISO-8601 week string (e.g. "2026-W27"), via the standard
 * "shift to this week's Thursday, that Thursday's year owns the week" rule.
 * @param {Date} [now]
 * @returns {string}
 */
export function currentISOWeek(now = new Date()) {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / DAY_MS) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Whole weeks between two dates, rounded up (min 0). Moved from
 * components/contractor/formHelpers.js (architecture-conformance pass) —
 * pure date math, no React.
 * @param {Date} start
 * @param {Date} end
 * @returns {number}
 */
export function calculateWeeksBetween(start, end) {
  return Math.max(0, Math.ceil((end - start) / (7 * DAY_MS)));
}

/**
 * Which construction week `reference` falls in, given a project's
 * start/end dates. Moved from components/contractor/formHelpers.js
 * (architecture-conformance pass) — pure date math, no React.
 * @param {Date} start
 * @param {Date} end
 * @param {Date} reference
 * @returns {{totalWeeks: number, weekNumber: number, label: string}}
 */
export function getConstructionWeekInfo(start, end, reference) {
  const totalWeeks = calculateWeeksBetween(start, end);
  if (reference < start) return { totalWeeks, weekNumber: 0, label: "Before construction start" };
  if (reference >= end) return { totalWeeks, weekNumber: totalWeeks, label: `Construction complete · ${totalWeeks} weeks` };
  const weekNumber = Math.min(Math.floor((reference - start) / (7 * DAY_MS)) + 1, totalWeeks);
  return { totalWeeks, weekNumber, label: `Week ${weekNumber} of ${totalWeeks}` };
}
