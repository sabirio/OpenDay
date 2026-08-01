import { computeEffectiveWeights } from '../../../engines/templateWeightsEngine.js';
import { computeMasterCatalogEffectiveWeights } from '../../../engines/masterCatalogWeightEngine.js';
import {
  MASTER_CATALOG_SCHEMA_VERSION,
  validateMasterCatalogWeightMetadata,
} from '../../../domains/construction/templates/versionedScopeTemplate.js';

/**
 * ONE canonical, schema-aware resolver for Construction Progress WEIGHTS
 * (Slice 5E.1 Phase 3) — the single place progressEngine.js asks "what does
 * each selected work package contribute to Construction Progress." Nothing
 * outside progressEngine.js calls this directly; every other consumer
 * (Weekly Reports, Dashboard, Portfolio, Contractor analytics, Risk) keeps
 * calling progressEngine.js's existing public functions unchanged and never
 * needs to know which formula applied.
 *
 * schemaVersion !== 2 (including 1, legacy/unversioned, or no template at
 * all): delegates BYTE-IDENTICAL to computeEffectiveWeights() — zero
 * reinterpretation of certified v1 behavior. `phaseWeights: null` signals
 * "use the template's own static phaseWeights untouched" — exactly today's
 * v1 behavior, unchanged.
 *
 * schemaVersion === 2: the Slice 5E-R "responsive category effort" model,
 * implemented in engines/masterCatalogWeightEngine.js (this file only
 * validates and routes — the actual formula lives in engines/, matching
 * every other weight/progress calculation in this codebase).
 *
 * @param {object} args
 * @param {{schemaVersion?: number, groupShares?: Record<string,number>, rawData?: object}|null} args.template — buildV2ProgressTemplate()/buildMasterCatalogProgressTemplate() output
 * @param {Array<object>} args.workPackages — the resolved template's own catalog WP list
 * @param {string[]|null} args.scopeWPIds
 * @param {Record<string, number>} [args.phaseWeights] — v1's static per-phase weights (from resolveTemplate()), only read on the v1 path
 * @returns {{ effectiveWeights: Record<string, number>, phaseWeights: Record<string, number>|null }}
 */
export function resolveProjectProgressWeights({ template, workPackages, scopeWPIds, phaseWeights }) {
  if (template?.schemaVersion !== MASTER_CATALOG_SCHEMA_VERSION) {
    return { effectiveWeights: computeEffectiveWeights(workPackages, scopeWPIds, phaseWeights), phaseWeights: null };
  }

  const issues = validateMasterCatalogWeightMetadata(template.rawData);
  const errors = issues.filter(issue => issue.severity === 'error');
  if (errors.length > 0) {
    throw new Error(
      `REFUSING MASTER CATALOG PROGRESS CALCULATION: template is missing required operational weight metadata `
      + `(${errors.length} issue(s), first: ${errors[0].code} — ${errors[0].message}). `
      + `Author baseEffort/categoryFactor/constructionProgressEligible/areaBasis/anchorPct before using this template operationally.`
    );
  }

  return computeMasterCatalogEffectiveWeights(workPackages, scopeWPIds, template.groupShares);
}
