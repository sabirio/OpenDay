import { supabase } from '../lib/supabase.js';

function requireOrganizationId(organizationId) {
  if (!organizationId) throw new Error('BUSINESS_DEVELOPMENT_ORGANIZATION_REQUIRED');
  return organizationId;
}

export async function loadBusinessDevelopmentWorkspace(organizationId) {
  const { data, error } = await supabase.rpc('get_business_development_workspace', {
    p_organization_id: requireOrganizationId(organizationId),
  });
  if (error) throw error;
  return data ?? { organizationId, opportunities: [], estimates: [] };
}

export async function saveCommercialOpportunity(organizationId, input, requestId = crypto.randomUUID()) {
  const { data, error } = await supabase.rpc('save_commercial_opportunity', {
    p_organization_id: requireOrganizationId(organizationId),
    p_opportunity_id: input.opportunityId,
    p_opportunity_number: input.opportunityNumber,
    p_title: input.title,
    p_client_name: input.clientName,
    p_currency_code: input.currencyCode,
    p_status: input.status,
    p_expected_revision: Number(input.revision || 0),
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

export async function saveDeliveryEstimate(organizationId, command, requestId = crypto.randomUUID()) {
  const { data, error } = await supabase.rpc('save_delivery_estimate', {
    p_organization_id: requireOrganizationId(organizationId),
    p_estimate_id: command.estimateId,
    p_opportunity_id: command.opportunityId,
    p_estimate_number: command.estimateNumber,
    p_title: command.title,
    p_currency_code: command.currencyCode,
    p_status: command.status || 'DRAFT',
    p_items: command.items,
    p_expected_revision: Number(command.expectedRevision || 0),
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}
