import { supabase } from '../lib/supabase';

export async function loadCommercialFoundation(projectId) {
  const { data, error } = await supabase.rpc('get_project_commercial_foundation', { p_project_id: projectId });
  if (error) throw error;
  return data;
}

export async function saveCostPackage(projectId, payload, clientRequestId) {
  const { data, error } = await supabase.rpc('save_project_cost_package', {
    p_project_id: projectId,
    p_cost_package_id: payload.costPackageId,
    p_code: payload.code,
    p_name: payload.name,
    p_procurement_method: payload.procurementMethod,
    p_currency_code: payload.currencyCode,
    p_status: payload.status,
    p_work_group_ids: payload.workGroupIds,
    p_note: payload.note,
    p_expected_revision: payload.expectedRevision,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return data;
}

export async function loadProjectTeamFoundation(projectId) {
  const { data, error } = await supabase.rpc('get_project_team_foundation', { p_project_id: projectId });
  if (error) throw error;
  return data;
}

export async function saveProjectTeamMembership(projectId, payload, clientRequestId) {
  const { data, error } = await supabase.rpc('save_project_team_membership', {
    p_project_id: projectId,
    p_membership_id: payload.membershipId,
    p_user_id: payload.userId,
    p_project_role: payload.projectRole,
    p_responsibility_label: payload.responsibilityLabel,
    p_starts_on: payload.startsOn,
    p_ends_on: payload.endsOn,
    p_notifications_enabled: payload.notificationsEnabled,
    p_capability_codes: payload.capabilityCodes,
    p_cost_package_ids: payload.costPackageIds,
    p_responsibility_type: payload.responsibilityType,
    p_expected_revision: payload.expectedRevision,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return data;
}

export async function createTenderPackage(projectId, payload, clientRequestId) {
  const { data, error } = await supabase.rpc('create_project_tender_package', {
    p_project_id: projectId,
    p_tender_id: payload.tenderId,
    p_tender_number: payload.tenderNumber,
    p_cost_package_ids: payload.costPackageIds,
    p_procurement_method: payload.procurementMethod,
    p_boq_mode: payload.boqMode,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return data;
}

export async function saveTenderPackageIdentity(payload, clientRequestId) {
  const { data, error } = await supabase.rpc('save_tender_package_commercial_identity', {
    p_tender_id: payload.tenderId,
    p_cost_package_ids: payload.costPackageIds,
    p_procurement_method: payload.procurementMethod,
    p_boq_mode: payload.boqMode,
    p_expected_revision: payload.expectedRevision,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return data;
}
