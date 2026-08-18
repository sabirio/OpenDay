import { supabase } from '../lib/supabase';

/**
 * Thin I/O wrappers for the Contractor Schedule Submission -> PM Review ->
 * Approved Baseline lifecycle (Simplification Phase 4B.2). Every read here
 * goes through ordinary RLS-protected SELECT (public.project_schedule_versions
 * / public.project_schedule_version_tasks, certified in migration 049) — no
 * dedicated read RPC exists or is needed, since the existing SELECT policies
 * already scope correctly per role (see can_access_schedule_submissions()).
 * Writes go through the three certified SECURITY DEFINER RPCs
 * (049_contractor_schedule_submission_lifecycle.sql) unchanged.
 *
 * This file only shapes rows (snake_case -> camelCase) and passes data
 * through — no formulas, no lifecycle rules (service-purity, architecture
 * guard).
 */

function fromDBVersion(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    submissionNumber: row.submission_number,
    baselineRevisionNumber: row.baseline_revision_number,
    status: row.status,
    templateId: row.template_id,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    contractorComment: row.contractor_comment,
    pmComment: row.pm_comment,
    createdAt: row.created_at,
    executionScopeVersionId: row.execution_scope_version_id,
  };
}

function fromDBVersionTask(row) {
  return {
    id: row.wp_id,
    plannedStart: row.planned_start,
    plannedEnd: row.planned_end,
    durationDays: row.duration_days,
    scheduleActivityId: row.schedule_activity_id,
    activityTitle: row.activity_title,
    activityPhaseId: row.activity_phase_id,
    activityPhaseLabel: row.activity_phase_label,
  };
}

function fromDBVersionActivityWorkGroup(row) {
  return {
    versionId: row.version_id,
    scheduleActivityId: row.schedule_activity_id,
    executionScopeVersionId: row.execution_scope_version_id,
    ontologyVersionId: row.ontology_version_id,
    workGroupId: row.work_group_id,
  };
}

/** Complete submission history for a project, oldest first. */
export async function loadScheduleVersions(projectId) {
  if (!projectId) return [];
  const { data, error } = await supabase
    .from('project_schedule_versions')
    .select('*')
    .eq('project_id', projectId)
    .order('submission_number', { ascending: true });
  if (error) throw error;
  return (data || []).map(fromDBVersion);
}

/** Immutable per-WP snapshot for one submission — never live project_gantt_tasks. */
export async function loadScheduleVersionTasks(versionId) {
  if (!versionId) return [];
  const { data, error } = await supabase
    .from('project_schedule_version_tasks')
    .select('*')
    .eq('version_id', versionId)
    .order('wp_id', { ascending: true });
  if (error) throw error;
  return (data || []).map(fromDBVersionTask);
}

/** Immutable Activity -> Work Group membership captured with a canonical submission. */
export async function loadScheduleVersionActivityWorkGroups(versionId) {
  if (!versionId) return [];
  const { data, error } = await supabase
    .from('project_schedule_version_activity_work_groups')
    .select('*')
    .eq('version_id', versionId)
    .order('schedule_activity_id', { ascending: true })
    .order('work_group_id', { ascending: true });
  if (error) throw error;
  return (data || []).map(fromDBVersionActivityWorkGroup);
}

/** The ONE canonical capability status (DRAFT/PENDING_REVIEW/APPROVED) — public.contractor_schedule_lifecycle_status(), granted EXECUTE to authenticated, safe to call directly. */
export async function loadScheduleLifecycleStatus(projectId) {
  if (!projectId) return 'DRAFT';
  const { data, error } = await supabase.rpc('contractor_schedule_lifecycle_status', { p_project_id: projectId });
  if (error) throw error;
  return data;
}

export async function submitSchedule(projectId, clientRequestId, comment) {
  const { data, error } = await supabase.rpc('submit_contractor_schedule', {
    p_project_id: projectId,
    p_client_request_id: clientRequestId,
    p_contractor_comment: comment || null,
  });
  if (error) throw error;
  return {
    baselineId: data?.baselineId,
    submissionId: data?.submissionId,
    projectId: data?.projectId,
    submissionNumber: data?.submissionNumber,
    status: data?.status,
    scheduledCount: data?.scheduledCount,
    executionScopeVersionId: data?.executionScopeVersionId,
    idempotentReplay: data?.idempotentReplay === true,
  };
}

export async function requestScheduleChanges(submissionId, comment, clientRequestId) {
  const { data, error } = await supabase.rpc('request_schedule_changes', {
    p_submission_id: submissionId,
    p_comment: comment,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return {
    submissionId: data?.submissionId,
    projectId: data?.projectId,
    status: data?.status,
    idempotentReplay: data?.idempotentReplay === true,
  };
}

export async function approveScheduleSubmission(submissionId, comment, clientRequestId) {
  const { data, error } = await supabase.rpc('approve_schedule_submission', {
    p_submission_id: submissionId,
    p_comment: comment || null,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return {
    submissionId: data?.submissionId,
    projectId: data?.projectId,
    status: data?.status,
    baselineRevisionNumber: data?.baselineRevisionNumber,
    executionScopeVersionId: data?.executionScopeVersionId,
    activityCount: data?.activityCount,
    workGroupCount: data?.workGroupCount,
    idempotentReplay: data?.idempotentReplay === true,
  };
}
