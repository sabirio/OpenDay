import { supabase } from '../lib/supabase';
import { fetchCurrentProjectExecutionScope } from './executionScopeService.js';

/**
 * Save a batch of Contractor Draft schedule changes atomically.
 *
 * One call = one Save Draft action = one client_request_id. The server
 * (save_contractor_schedule_draft, finalized by
 * 047_contractor_schedule_human_date_semantics.sql) validates the entire
 * batch and either writes all of it or none of it — this function is a thin
 * RPC wrapper, it does not itself decide atomicity.
 *
 * plannedFinish is human-facing INCLUSIVE (Simplification Phase 3B.1) — the
 * server canonicalizes it to the internal exclusive planned_end boundary.
 * This function must never receive or send the internal exclusive value;
 * see engines/ganttLayout.js's toHumanFinishInclusive/toInternalEndBoundary
 * for the one place that conversion happens on the read side.
 *
 * @param {string|number} projectId
 * @param {Array<{ wpId: string, plannedStart: string, plannedFinish: string }>} changes
 * @param {string} clientRequestId — uuid, see core/write/writeCommand.js's createClientRequestId()
 * @returns {Promise<{ projectId, updatedCount, wpIds, idempotentReplay }>}
 */
export async function saveContractorScheduleDraft(projectId, changes, clientRequestId) {
  const { data, error } = await supabase.rpc('save_contractor_schedule_draft', {
    p_project_id: projectId,
    p_changes: changes,
    p_client_request_id: clientRequestId,
  });

  if (error) throw error;

  return {
    projectId: data?.projectId,
    updatedCount: data?.updatedCount ?? 0,
    wpIds: data?.wpIds || [],
    idempotentReplay: data?.idempotentReplay === true,
  };
}

export async function fetchContractorScheduleSetup(projectId) {
  const executionScope = await fetchCurrentProjectExecutionScope(projectId);
  if (!executionScope) return null;

  const [{ data: activityRows, error: activityError }, { data: linkRows, error: linkError }] = await Promise.all([
    supabase
      .from('project_schedule_activities')
      .select('id, project_id, execution_scope_version_id, title, sort_order, is_archived')
      .eq('project_id', projectId)
      .eq('execution_scope_version_id', executionScope.id)
      .eq('is_archived', false)
      .order('sort_order', { ascending: true }),
    supabase
      .from('project_schedule_activity_work_groups')
      .select('activity_id, execution_scope_version_id, work_group_id')
      .eq('project_id', projectId)
      .eq('execution_scope_version_id', executionScope.id),
  ]);
  if (activityError) throw activityError;
  if (linkError) throw linkError;

  const linksByActivity = new Map();
  for (const link of linkRows || []) {
    if (!linksByActivity.has(link.activity_id)) linksByActivity.set(link.activity_id, []);
    linksByActivity.get(link.activity_id).push(link.work_group_id);
  }
  const canonicalOrder = new Map(executionScope.workGroupIds.map((id, index) => [id, index]));
  const activities = (activityRows || []).map(row => ({
    activityId: row.id,
    title: row.title,
    workGroupIds: (linksByActivity.get(row.id) || [])
      .sort((a, b) => canonicalOrder.get(a) - canonicalOrder.get(b)),
  }));
  return { executionScope, activities, configured: activities.length > 0 };
}

export async function saveContractorScheduleSetup(
  projectId,
  executionScopeVersionId,
  activities,
  clientRequestId,
) {
  const { data, error } = await supabase.rpc('save_contractor_schedule_setup', {
    p_project_id: projectId,
    p_execution_scope_version_id: executionScopeVersionId,
    p_activities: activities,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return {
    projectId: data?.projectId,
    executionScopeVersionId: data?.executionScopeVersionId,
    activityCount: data?.activityCount ?? 0,
    archivedCount: data?.archivedCount ?? 0,
    idempotentReplay: data?.idempotentReplay === true,
  };
}
