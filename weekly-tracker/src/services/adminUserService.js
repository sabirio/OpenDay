import { supabase } from '../lib/supabase';

export async function listAdminUsers() {
  const { data, error } = await supabase.rpc('list_admin_users');
  if (error) throw error;
  return data || [];
}

export async function updateAdminUser(input, requestId) {
  const { data, error } = await supabase.rpc('update_admin_user_profile', {
    p_user_id: input.id,
    p_name: input.name || '',
    p_job_role: input.accessRole === 'Contractor' ? null : input.role,
    p_access_role: input.accessRole,
    p_assigned_project_ids: input.accessRole === 'Contractor' ? (input.assignedProjects || []) : [],
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

export async function deactivateAdminUser(userId, requestId) {
  const { data, error } = await supabase.rpc('remove_admin_user', {
    p_user_id: userId,
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}
