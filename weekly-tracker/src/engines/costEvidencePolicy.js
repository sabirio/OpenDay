/**
 * costEvidencePolicy — the ONE shared analytical-comparability rule for
 * "is this project's actual cost usable evidence for an actual-cost-per-area
 * comparison?" Extracted from engines/benchmarkEngine.js, where the same
 * `actualCost > 0` check was independently inlined in two places
 * (candidate eligibility and target comparison availability) — duplicated
 * logic that Cost Intelligence Engine would otherwise have had to
 * re-duplicate a third time.
 *
 * This is a BENCHMARK/COST-INTELLIGENCE-LAYER POLICY DECISION, not a
 * Historical Data Foundation correction: Historical Foundation correctly
 * preserves `actualCost = 0` as a real, non-null fact ("unknown ≠ zero") and
 * its own `eligibility.costPerTotalSqm`/`costPerSalesSqm` stay true at
 * actualCost = 0 (a genuinely measured zero is still a known value). A
 * project with a non-positive actual cost is simply not meaningful evidence
 * for a cost-PER-AREA comparison — this module owns exactly that downstream
 * policy, nothing about Historical Foundation's own eligibility changes.
 *
 * Does not apply to costVariancePercent (dimensionless — a $0-actual-cost
 * project can still have a meaningful, if extreme, budget variance); callers
 * decide per metric whether this predicate applies, this module only answers
 * the one factual question its name asks.
 */

/**
 * @param {{ financial?: { actualCost?: number|null } }} projectFacts - a HistoricalProjectFacts row
 * @returns {boolean} true only when actualCost is a finite number strictly greater than zero
 */
export function isUsableActualCostEvidence(projectFacts) {
  const actualCost = projectFacts?.financial?.actualCost;
  return typeof actualCost === 'number' && Number.isFinite(actualCost) && actualCost > 0;
}
