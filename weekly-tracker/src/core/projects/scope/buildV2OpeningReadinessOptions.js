import {
  getScopeTemplateDependencies,
  getScopeTemplateWorkPackages,
  resolveV2TemplateData,
} from '../../../domains/construction/templates/versionedScopeTemplate.js';

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
export function buildV2OpeningReadinessOptions(projectOrTemplate = null) {
  const data = resolveV2TemplateData(projectOrTemplate);
  const workPackages = getScopeTemplateWorkPackages(data);
  return {
    blockerWPs: workPackages
      .filter(wp => wp.openingBlocker === 'critical' || wp.openingBlocker === 'soft')
      .map(wp => ({ ...wp, phaseId: wp.categoryId })),
    allWpIds: workPackages.map(wp => wp.id),
    dependencyRules: getScopeTemplateDependencies(data),
  };
}
