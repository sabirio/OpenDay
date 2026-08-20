import { supabase } from '../lib/supabase';

export async function listAdminUsers(organizationId) {
  const { data, error } = await supabase.rpc('list_organization_users', {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return data ?? { organizationId, users: [], invitations: [] };
}

export async function updateAdminUser(organizationId, input, requestId) {
  const { data, error } = await supabase.rpc('update_organization_user', {
    p_organization_id: organizationId,
    p_user_id: input.id,
    p_name: input.name || '',
    p_organization_role: input.organizationRole,
    p_access_role: input.accessRole,
    p_job_role: input.role || null,
    p_expected_revision: input.revision,
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

export async function deactivateAdminUser(organizationId, input, requestId) {
  const { data, error } = await supabase.rpc('deactivate_organization_user', {
    p_organization_id: organizationId,
    p_user_id: input.id,
    p_expected_revision: input.revision,
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

export async function inviteAdminUser(organizationId, input, requestId) {
  const { data, error } = await supabase.functions.invoke('send-organization-invitation', {
    body: {
      organizationId,
      email: input.email,
      name: input.name || null,
      organizationRole: input.organizationRole,
      accessRole: input.accessRole,
      jobRole: input.role || null,
      clientRequestId: requestId,
      redirectOrigin: window.location.origin,
    },
  });
  if (error) throw error;
  if (data?.error) {
    const failure = new Error(data.error);
    failure.code = data.error;
    throw failure;
  }
  return data;
}
