import { supabase } from '../lib/supabase';

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
