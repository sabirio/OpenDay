/**
 * evaluateSiteVisitImpact — "what did this one PM site visit find vs. the
 * contractor's claim", for a single visit.
 *
 * Thin single-visit wrapper around siteVisitEngine's canonical Gantt-format
 * comparison (visit.wps vs the referenced contractor report) — composes
 * computeSiteVisitData/computeSiteVisitKpis rather than re-deriving
 * discrepancy classification here.
 *
 * @see types.js for the SiteVisitImpact shape.
 */
import { computeSiteVisitData, computeSiteVisitKpis } from '../../engines/siteVisitEngine';

/**
 * @param {object} visit — a single site visit row (siteVisitService shape, with .wps attached)
 * @param {Array} projects — full project list (siteVisitEngine matches visit.projectId against it)
 * @param {Array} reports — full reports list (siteVisitEngine matches visit.referenceReportId against it)
 * @returns {import('./types.js').SiteVisitImpact|null} null when the visit can't be matched to a project
 */
export function evaluateSiteVisitImpact(visit, projects, reports) {
  const [result] = computeSiteVisitData([visit], projects, reports);
  if (!result) return null;
  const kpis = computeSiteVisitKpis([result]);
  return { ...result, kpis };
}
