import { supabase } from '../lib/supabase';

export async function listConsultantBoqAssignments() {
  const { data, error } = await supabase.rpc('list_my_consultant_boq_assignments');
  if (error) throw error;
  return data;
}

export async function loadConsultantBoqWorkspace(tenderId) {
  const { data, error } = await supabase.rpc('get_consultant_boq_workspace', { p_tender_id: tenderId });
  if (error) throw error;
  return data;
}

export async function saveConsultantBoq(payload, clientRequestId) {
  const { data, error } = await supabase.rpc('save_consultant_boq_revision', {
    p_tender_id: payload.tenderId,
    p_consultant_boq_id: payload.consultantBoqId,
    p_project_boq_id: payload.projectBoqId,
    p_items: payload.items,
    p_expected_revision: payload.expectedRevision,
    p_revision_note: payload.revisionNote,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return data;
}

export async function submitConsultantBoq(consultantBoqId, revisionNumber, clientRequestId) {
  const { data, error } = await supabase.rpc('submit_consultant_boq', {
    p_consultant_boq_id: consultantBoqId,
    p_expected_revision: revisionNumber,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return data;
}

export async function reviewConsultantBoq(consultantBoqId, decision, note, revisionNumber, clientRequestId) {
  const { data, error } = await supabase.rpc('review_consultant_boq', {
    p_consultant_boq_id: consultantBoqId,
    p_decision: decision,
    p_note: note,
    p_expected_revision: revisionNumber,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return data;
}
