import { supabase } from '../lib/supabase';

// Bulk (bounded-query) I/O for the schedule commitment projection
// (Simplification Phase 3D.1) — reads the SAME two tables
// scheduleSubmissionService.js already reads per-project (public.
// project_schedule_versions / public.project_schedule_version_tasks,
// certified in migration 049), through the same ordinary RLS-protected
// SELECT — no new table, no new RPC, no schema change. The only difference
// from scheduleSubmissionService.js is `.in(...)` over a project/version id
// SET instead of `.eq(...)` on a single id, so a Dashboard/Workspace of N
// projects costs exactly one query here, never N.
//
// This file only shapes rows (snake_case -> camelCase) and passes data
// through — no formulas, no lifecycle rules (service-purity, architecture
// guard). Row shaping mirrors scheduleSubmissionService.js's
// fromDBVersion()/fromDBVersionTask() exactly.

function fromDBVersion(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    submissionNumber: row.submission_number,
    baselineRevisionNumber: row.baseline_revision_number,
    status: row.status,
    reviewedAt: row.reviewed_at,
  };
}

function fromDBVersionTask(row) {
  return {
    versionId: row.version_id,
    plannedStart: row.planned_start,
  };
}

/**
 * Every project_schedule_versions row for a bounded set of projects, in ONE
 * query. Callers reduce this to "latest per project" / "approved per
 * project" themselves (scheduleCommitmentBatchProjection.js) — kept as raw
 * rows here so this file stays a pure I/O boundary.
 * @param {Array<string|number>} projectIds
 * @returns {Promise<Array>}
 */
export async function loadScheduleVersionsForProjects(projectIds) {
  const ids = [...new Set((projectIds || []).filter((id) => id != null).map(String))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('project_schedule_versions')
    .select('id, project_id, submission_number, baseline_revision_number, status, reviewed_at')
    .in('project_id', ids);
  if (error) throw error;
  return (data || []).map(fromDBVersion);
}

/**
 * Immutable per-WP snapshot rows for a bounded set of APPROVED version ids,
 * in ONE query — never project_gantt_tasks (the mutable live Draft).
 * @param {Array<string|number>} versionIds
 * @returns {Promise<Array>}
 */
export async function loadScheduleVersionTasksForVersions(versionIds) {
  const ids = [...new Set((versionIds || []).filter((id) => id != null).map(String))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('project_schedule_version_tasks')
    .select('version_id, planned_start')
    .in('version_id', ids);
  if (error) throw error;
  return (data || []).map(fromDBVersionTask);
}
