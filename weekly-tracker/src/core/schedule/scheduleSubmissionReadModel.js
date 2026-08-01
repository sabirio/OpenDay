// Pure read-model composition over public.project_schedule_versions rows
// (Simplification Phase 4B.2). No Supabase, no React — operates only on
// already-fetched, already-camelCased data (see
// services/scheduleSubmissionService.js for the I/O + shaping side).
//
// Two deliberately separate concepts (Phase 4B.2 Section N):
//   1. CAPABILITY status (DRAFT/PENDING_REVIEW/APPROVED) — owned by
//      contractorScheduleLifecycle.js, mirrors the canonical SQL helper
//      exactly, and collapses "never submitted" and "CHANGES_REQUESTED"
//      into the same DRAFT capability (both mean the Draft is editable).
//   2. DISPLAY status (NONE/PENDING_REVIEW/CHANGES_REQUESTED/APPROVED) —
//      this file's job. Must NOT collapse CHANGES_REQUESTED into a
//      visually anonymous DRAFT: the Contractor must see that PM returned
//      a previous submission, with its comment, not just "back to editing"
//      with no explanation.

/** Every version row for a project, most recent submission first. */
export function sortVersionsBySubmissionDesc(versions = []) {
  return [...versions].sort((a, b) => b.submissionNumber - a.submissionNumber);
}

export function findLatestVersion(versions = []) {
  if (versions.length === 0) return null;
  return sortVersionsBySubmissionDesc(versions)[0];
}

export function findPendingVersion(versions = []) {
  return versions.find((v) => v.status === 'PENDING_REVIEW') || null;
}

/** At most one row can ever reach APPROVED in this MVP (revisions are not built yet — Phase 4B.2 scope) — Draft/Scope/Save/Submit are all locked out the instant one does. */
export function findApprovedVersion(versions = []) {
  return versions.find((v) => v.status === 'APPROVED') || null;
}

/**
 * The one DISPLAY status a page renders. Driven by the latest version row's
 * own `status` column, not re-derived from the capability helper — the
 * capability helper intentionally can't distinguish "never submitted" from
 * "returned via Request Changes" (both are DRAFT for editability purposes),
 * but the display layer must.
 * @param {Array} versions
 * @returns {'NONE'|'PENDING_REVIEW'|'CHANGES_REQUESTED'|'APPROVED'}
 */
export function deriveSubmissionDisplayStatus(versions = []) {
  const latest = findLatestVersion(versions);
  if (!latest) return 'NONE';
  return latest.status;
}
