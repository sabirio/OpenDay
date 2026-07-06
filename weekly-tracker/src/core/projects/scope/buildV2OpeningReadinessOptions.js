import { ALL_WORK_PACKAGES_V2 } from '../../../domains/construction/templates/retailFitoutV2.js';
import { DEPENDENCY_RULES_V2 } from '../../../config/dependencyRulesV2.js';

/**
 * Builds the templateOptions argument openingReadinessEngine.computeOpeningReadiness
 * needs to evaluate a v2 (zoned) project instead of the v1 constructionRetailV1
 * default it falls back to when templateOptions is omitted.
 *
 * blockerWPs' phaseId is remapped from zone id (ALL_WORK_PACKAGES_V2's
 * scope-filtering convention — see that file's own comment) to category id,
 * because openingReadinessEngine.getTaskEntry() reads
 * wpStatuses[wp.phaseId][wp.label], and v2's wpCumulativeStatuses is keyed
 * by category id at the top level (see buildV2ProgressTemplate.js) — the
 * same object a v2 project's progress is computed from.
 *
 * @returns {{blockerWPs: object[], allWpIds: string[], dependencyRules: object[]}}
 */
export function buildV2OpeningReadinessOptions() {
  return {
    blockerWPs: ALL_WORK_PACKAGES_V2
      .filter(wp => wp.openingBlocker === 'critical' || wp.openingBlocker === 'soft')
      .map(wp => ({ ...wp, phaseId: wp.categoryId })),
    allWpIds: ALL_WORK_PACKAGES_V2.map(wp => wp.id),
    dependencyRules: DEPENDENCY_RULES_V2,
  };
}
