import { addConsultantCustomItem, buildConsultantAssignmentPresentation, buildConsultantBoqPresentation, createConsultantBoqDraft, getConsultantBoqSaveCommand, patchConsultantBoqDraft, patchConsultantCustomItem, patchConsultantQuantity, removeConsultantCustomItem } from '../../engines/consultantBoqEngine.js';
import { listConsultantBoqAssignments, loadConsultantBoqWorkspace, reviewConsultantBoq, saveConsultantBoq, submitConsultantBoq } from '../../services/consultantBoqService.js';
import { createClientRequestId } from '../write/writeCommand.js';

export async function loadConsultantAssignmentsView() {
  return buildConsultantAssignmentPresentation(await listConsultantBoqAssignments());
}

export async function loadConsultantBoqEditor(tenderId) {
  return createConsultantBoqDraft(await loadConsultantBoqWorkspace(tenderId));
}

export function presentConsultantBoq(draft) { return buildConsultantBoqPresentation(draft); }
export function changeConsultantQuantity(draft, lineId, value) { return patchConsultantQuantity(draft, lineId, value); }
export function changeConsultantBoq(draft, patch) { return patchConsultantBoqDraft(draft, patch); }
export function appendConsultantCustomItem(draft, workGroupId) { return addConsultantCustomItem(draft, workGroupId, createClientRequestId()); }
export function changeConsultantCustomItem(draft, lineId, patch) { return patchConsultantCustomItem(draft, lineId, patch); }
export function discardConsultantCustomItem(draft, lineId) { return removeConsultantCustomItem(draft, lineId); }
export async function commitConsultantBoq(draft) { return saveConsultantBoq(getConsultantBoqSaveCommand(draft), createClientRequestId()); }
export async function sendConsultantBoq(draft) { return submitConsultantBoq(draft.consultantBoqId, draft.revisionNumber, createClientRequestId()); }
export async function decideConsultantBoq(draft, decision) { return reviewConsultantBoq(draft.consultantBoqId, decision, draft.reviewNote, draft.revisionNumber, createClientRequestId()); }
