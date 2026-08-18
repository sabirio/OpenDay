import { supabase } from '../lib/supabase';

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export const loadProjectRiskRegister = projectId =>
  rpc('get_project_risk_register', { p_project_id: Number(projectId) });
export const registerProjectSource = (input, requestId) =>
  rpc('register_project_source_reference', {
    p_project_id: Number(input.projectId), p_reference_id: input.referenceId,
    p_source_kind: input.sourceKind, p_source_id: input.sourceId || null,
    p_manual_reference: input.manualReference || '', p_description: input.description || '',
    p_client_request_id: requestId,
  });
export const createProjectRisk = (input, requestId) =>
  rpc('create_project_risk', {
    p_project_id: Number(input.projectId), p_risk_id: input.riskId,
    p_source_reference_id: input.sourceReferenceId, p_title: input.title,
    p_description: input.description || '', p_severity: input.severity,
    p_likelihood: input.likelihood, p_owner_membership_id: input.ownerMembershipId,
    p_due_date: input.dueDate || null, p_client_request_id: requestId,
  });
export const transitionProjectRisk = (riskId, action, revision, requestId) =>
  rpc('transition_project_risk', { p_risk_id: riskId, p_action: action, p_expected_revision: revision, p_client_request_id: requestId });
export const createProjectAction = (input, requestId) =>
  rpc('create_project_action', {
    p_project_id: Number(input.projectId), p_action_id: input.actionId, p_risk_id: input.riskId,
    p_title: input.title, p_description: input.description || '',
    p_owner_membership_id: input.ownerMembershipId, p_due_date: input.dueDate,
    p_client_request_id: requestId,
  });
export const transitionProjectAction = (actionId, action, revision, requestId) =>
  rpc('transition_project_action', { p_action_id: actionId, p_action: action, p_expected_revision: revision, p_client_request_id: requestId });
export const linkVariationProvenance = (variationId, actionId, requestId) =>
  rpc('link_project_variation_provenance', { p_variation_id: variationId, p_action_id: actionId, p_client_request_id: requestId });
