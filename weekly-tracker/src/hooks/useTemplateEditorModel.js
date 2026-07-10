export {
  setPhaseWeight, setWorkPackageDuration, movePhase, normalizeWeights, computeTemplateWeightSums,
} from '../core/projects/templateEditor.js';
export { validateTemplate, isTemplateValid, countErrors } from '../core/projects/validation/validateTemplate.js';
export { isWithinEpsilon, WEIGHT_SUM_TARGET } from '../core/projects/weights/normalizeWeightsTo100.js';
