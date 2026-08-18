import { createClientRequestId } from '../write/writeCommand.js';
import {
  createProjectAction, createProjectRisk, linkVariationProvenance, loadProjectRiskRegister,
  registerProjectSource, transitionProjectAction, transitionProjectRisk,
} from '../../services/riskActionService.js';

export const loadRiskRegister = projectId => loadProjectRiskRegister(projectId);
export const commitProjectSource = input => registerProjectSource(input, createClientRequestId());
export const commitProjectRisk = input => createProjectRisk(input, createClientRequestId());
export const commitRiskTransition = (riskId, action, revision) => transitionProjectRisk(riskId, action, revision, createClientRequestId());
export const commitProjectAction = input => createProjectAction(input, createClientRequestId());
export const commitActionTransition = (actionId, action, revision) => transitionProjectAction(actionId, action, revision, createClientRequestId());
export const commitVariationProvenance = (variationId, actionId) => linkVariationProvenance(variationId, actionId, createClientRequestId());
