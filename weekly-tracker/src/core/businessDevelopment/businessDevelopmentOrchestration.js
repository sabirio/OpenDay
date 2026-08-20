import {
  loadBusinessDevelopmentWorkspace,
  saveCommercialOpportunity,
  saveDeliveryEstimate,
  saveEstimatePricing,
  saveOrganizationRateCardEntry,
  saveCommercialProposalRevision,
  transitionCommercialProposal,
} from '../../services/businessDevelopmentService.js';
import {
  prepareDeliveryEstimateCommand,
  presentBusinessDevelopmentWorkspace,
  preparePricingCommand,
  prepareProposalCommand,
} from '../presentation/businessDevelopmentPresentationModel.js';

export async function loadBusinessDevelopment(organizationId) {
  return presentBusinessDevelopmentWorkspace(await loadBusinessDevelopmentWorkspace(organizationId));
}

export async function commitCommercialOpportunity(organizationId, input) {
  return saveCommercialOpportunity(organizationId, {
    ...input,
    opportunityId: input.opportunityId || crypto.randomUUID(),
  });
}

export async function commitDeliveryEstimate(organizationId, draft) {
  const command = prepareDeliveryEstimateCommand({
    ...draft,
    estimateId: draft.estimateId || crypto.randomUUID(),
  });
  return saveDeliveryEstimate(organizationId, { ...command, status: draft.status || 'DRAFT' });
}

export async function commitOrganizationRateCardEntry(organizationId, draft) {
  return saveOrganizationRateCardEntry(organizationId, { ...draft, rateCardId: draft.rateCardId || crypto.randomUUID() });
}

export async function commitEstimatePricing(organizationId, draft) {
  const command = preparePricingCommand({ ...draft, pricingId: draft.pricingId || crypto.randomUUID() });
  return saveEstimatePricing(organizationId, command);
}

export async function commitCommercialProposalRevision(organizationId, draft) {
  const command = prepareProposalCommand({ ...draft, proposalId: draft.proposalId || crypto.randomUUID() });
  return saveCommercialProposalRevision(organizationId, command);
}

export async function commitCommercialProposalTransition(organizationId, input) {
  return transitionCommercialProposal(organizationId, input);
}
