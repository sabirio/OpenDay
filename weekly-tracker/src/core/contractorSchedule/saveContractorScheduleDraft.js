// Orchestration (I/O) half of the Contractor Draft buffer — pairs with the
// pure state transitions in contractorScheduleDraftModel.js. One Save Draft
// action = one client_request_id = one atomic RPC call; see
// save_contractor_schedule_draft (046_contractor_schedule_draft_foundation.sql,
// finalized to the human-inclusive plannedFinish contract by
// 047_contractor_schedule_human_date_semantics.sql) for the actual
// all-or-nothing transaction.
import { createClientRequestId, normalizeWriteError } from '../write/writeCommand.js';
import { saveContractorScheduleDraft as callSaveDraftRpc } from '../../services/contractorScheduleService.js';
import { toChangesArray } from './contractorScheduleDraftModel.js';

/**
 * Flush the current draft buffer to the server in one atomic call.
 *
 * On success, returns the RPC's result — the caller (the React hook) is
 * responsible for reconciling the draft buffer (reconcileAfterSave) and
 * clearing dirty state; this function does not mutate the buffer itself,
 * it only reads it (toChangesArray), keeping it consistent with
 * contractorScheduleDraftModel.js's pure-transition style.
 *
 * On failure, throws a normalized write error (same shape
 * submit_contractor_report/submitReport already use) — the caller must
 * leave the local draft buffer untouched, since the RPC is atomic and a
 * thrown error means nothing was persisted.
 *
 * @param {string|number} projectId
 * @param {import('./contractorScheduleDraftModel.js').DraftState} draftState
 * @returns {Promise<{ projectId, updatedCount, wpIds, idempotentReplay }>}
 */
export async function saveContractorScheduleDraftFromState(projectId, draftState) {
  const changes = toChangesArray(draftState);
  if (changes.length === 0) {
    throw Object.assign(new Error('No changes to save'), { code: 'VALIDATION_ERROR', field: 'changes' });
  }

  const clientRequestId = createClientRequestId();

  try {
    return await callSaveDraftRpc(projectId, changes, clientRequestId);
  } catch (error) {
    throw normalizeWriteError(error, 'schedule.save_draft', clientRequestId);
  }
}
