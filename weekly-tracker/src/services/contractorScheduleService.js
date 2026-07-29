import { supabase } from '../lib/supabase';

/**
 * Save a batch of Contractor Draft schedule changes atomically.
 *
 * One call = one Save Draft action = one client_request_id. The server
 * (save_contractor_schedule_draft, 046_contractor_schedule_draft_foundation.sql)
 * validates the entire batch and either writes all of it or none of it —
 * this function is a thin RPC wrapper, it does not itself decide atomicity.
 *
 * @param {string|number} projectId
 * @param {Array<{ wpId: string, plannedStart: string, plannedEnd: string }>} changes
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
