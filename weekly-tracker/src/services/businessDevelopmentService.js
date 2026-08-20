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
  return data ?? { organizationId, opportunities: [], estimates: [], rateCards: [], pricings: [], proposals: [] };
}

export async function saveOrganizationRateCardEntry(organizationId, input, requestId = crypto.randomUUID()) {
  const { data, error } = await supabase.rpc('save_organization_rate_card_entry', {
    p_organization_id: requireOrganizationId(organizationId),
    p_rate_card_id: input.rateCardId,
    p_role_name: input.roleName,
    p_discipline: input.discipline || null,
    p_internal_cost_rate: input.internalCostRate,
    p_selling_rate: input.sellingRate || null,
    p_currency_code: input.currencyCode,
    p_valid_from: input.validFrom,
    p_valid_to: input.validTo || null,
    p_status: input.status,
    p_expected_revision: Number(input.revision || 0),
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

export async function saveEstimatePricing(organizationId, command, requestId = crypto.randomUUID()) {
  const { data, error } = await supabase.rpc('save_estimate_pricing', {
    p_organization_id: requireOrganizationId(organizationId),
    p_pricing_id: command.pricingId,
    p_estimate_id: command.estimateId,
    p_pricing_method: command.pricingMethod,
    p_adjustment_value: command.adjustmentValue,
    p_basis_quantity: command.basisQuantity,
    p_rate_amount: command.rateAmount,
    p_fixed_price: command.fixedPrice,
    p_status: command.status,
    p_expected_revision: Number(command.expectedRevision || 0),
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

export async function saveCommercialProposalRevision(organizationId, command, requestId = crypto.randomUUID()) {
  const { data, error } = await supabase.rpc('save_commercial_proposal_revision', {
    p_organization_id: requireOrganizationId(organizationId),
    p_proposal_id: command.proposalId,
    p_pricing_id: command.pricingId,
    p_proposal_number: command.proposalNumber,
    p_title: command.title,
    p_currency_code: command.currencyCode,
    p_validity_days: command.validityDays,
    p_commercial_terms: command.commercialTerms,
    p_revision_reason: command.revisionReason,
    p_sections: command.sections,
    p_expected_revision: command.expectedRevision,
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

export async function transitionCommercialProposal(organizationId, input, requestId = crypto.randomUUID()) {
  const { data, error } = await supabase.rpc('transition_commercial_proposal', {
    p_organization_id: requireOrganizationId(organizationId),
    p_proposal_id: input.proposalId,
    p_target_status: input.targetStatus,
    p_expected_revision: input.expectedRevision,
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
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
