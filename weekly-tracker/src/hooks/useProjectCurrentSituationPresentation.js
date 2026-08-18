import { buildProjectCurrentSituation } from "../core/presentation/projectCurrentSituationModel.js";

export function useProjectCurrentSituationPresentation(project, options) {
  return buildProjectCurrentSituation(project, options);
}
