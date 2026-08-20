import {
  loadBusinessDevelopmentWorkspace,
  saveCommercialOpportunity,
  saveDeliveryEstimate,
} from '../../services/businessDevelopmentService.js';
import {
  prepareDeliveryEstimateCommand,
  presentBusinessDevelopmentWorkspace,
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
