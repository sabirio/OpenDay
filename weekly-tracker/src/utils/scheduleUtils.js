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
