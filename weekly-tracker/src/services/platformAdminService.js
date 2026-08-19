import { supabase } from '../lib/supabase';

async function rpc(name, input) {
  const { data, error } = await supabase.rpc(name, input);
  if (error) throw error;
  return data;
}

export async function listPlatformOrganizations() {
  return (await rpc('list_platform_organizations')) ?? [];
}

export function getPlatformOrganization(organizationId) {
  return rpc('get_platform_organization', { p_organization_id: organizationId });
}

export async function listPlatformPlans() {
  const { data, error } = await supabase.from('subscription_plans')
    .select('id,name,description,status,sort_order').eq('status','ACTIVE').order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function listPlatformCapabilities() {
  const { data, error } = await supabase.from('product_capability_catalog')
    .select('id,label,description,group_code,sort_order,status')
    .eq('status','ACTIVE').order('group_code').order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function listPlatformEntitlementEvents(organizationId) {
  const { data, error } = await supabase.from('platform_entitlement_change_events')
    .select('id,event_type,capability_id,entitlement_source,previous_data,new_data,changed_at')
    .eq('organization_id',organizationId).order('changed_at',{ ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}

export function setPlatformOrganizationStatus({ organizationId,status,expectedStatus,requestId }) {
  return rpc('set_platform_organization_status', {
    p_organization_id: organizationId,p_status: status,
    p_expected_status: expectedStatus,p_client_request_id: requestId,
  });
}

export function setPlatformOrganizationSubscription({
  organizationId,planId,status,startsAt,endsAt,expectedRevision,requestId,
}) {
  return rpc('set_platform_organization_subscription', {
    p_organization_id: organizationId,p_plan_id: planId,p_status: status,
    p_starts_at: startsAt,p_ends_at: endsAt || null,
    p_expected_revision: expectedRevision,p_client_request_id: requestId,
  });
}

export function setPlatformOrganizationEntitlement({
  organizationId,capabilityId,source='manual_override',enabled,config={},startsAt,
  expiresAt,expectedRevision,requestId,
}) {
  return rpc('set_platform_organization_entitlement', {
    p_organization_id: organizationId,p_capability_id: capabilityId,p_source: source,
    p_enabled: enabled,p_config: config,p_starts_at: startsAt,
    p_expires_at: expiresAt || null,p_expected_revision: expectedRevision,
    p_client_request_id: requestId,
  });
}
