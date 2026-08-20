import {
  buildEstimateCommand,
  calculateEstimate,
  createEstimateItem,
  summarizeBusinessDevelopmentWorkspace,
} from '../../engines/estimateEngine.js';

export const createDeliveryEstimateLine = (category) => createEstimateItem(category);
export const presentEstimateCalculation = (items) => calculateEstimate({ items });
export const prepareDeliveryEstimateCommand = (draft) => buildEstimateCommand(draft);
export const presentBusinessDevelopmentWorkspace = (workspace) => summarizeBusinessDevelopmentWorkspace(workspace);
