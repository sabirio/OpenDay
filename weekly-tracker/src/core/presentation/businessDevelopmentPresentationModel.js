import {
  buildEstimateCommand,
  calculateEstimate,
  createEstimateItem,
  summarizeBusinessDevelopmentWorkspace,
} from '../../engines/estimateEngine.js';
import { buildPricingCommand, calculatePricing, createPricingDraft } from '../../engines/pricingEngine.js';
import { buildProposalCommand, calculateProposalSections, createProposalSection } from '../../engines/proposalEngine.js';

export const createDeliveryEstimateLine = (category) => createEstimateItem(category);
export const presentEstimateCalculation = (items) => calculateEstimate({ items });
export const prepareDeliveryEstimateCommand = (draft) => buildEstimateCommand(draft);
export const presentBusinessDevelopmentWorkspace = (workspace) => summarizeBusinessDevelopmentWorkspace(workspace);
export const createCommercialPricingDraft = (estimate) => createPricingDraft(estimate);
export const presentPricingCalculation = (input) => calculatePricing(input);
export const preparePricingCommand = (draft) => buildPricingCommand(draft);
export const createCustomerProposalSection = () => createProposalSection();
export const presentProposalCalculation = (sections) => calculateProposalSections(sections);
export const prepareProposalCommand = (draft) => buildProposalCommand(draft);
