import { computeScheduleDeviation, computeTrend, computeDimensionRisk, computeWeeklyEvolution, computeAdjustedRisk } from '../../engines/riskEngine.js';
import { computeEscalations } from '../../engines/escalationEngine.js';
import { computeRecommendedActions } from '../../engines/actionEngine.js';
import { computeEVM } from '../../engines/evmEngine.js';
import { computeContractorDriftProfile, computeDriftRiskFactor, computeAdjustedProgress } from '../../engines/contractorDriftEngine.js';
import { computeMonteCarloForecast } from '../../engines/monteCarloEngine.js';
import { progressAtIndex } from '../../engines/progressEngine.js';

/**
 * Pure mapping from base rows -> risk-augmented rows.
 * riskScore, contScore, and health are forwarded from base (evaluateProjectState) -
 * none of them are recomputed here. They were previously recomputed independently
 * (P1.2 fix): computeContractorScores is a pure function of (project, projReports,
 * projSiteVisits), which are identical to what base already used, so the result was
 * always byte-identical, just wasted work. Recomputing health was worse than wasted -
 * it was called without latestReport, silently dropping the blocker/support reasons
 * that base.health already carries, so RiskDashboard showed a strictly worse health
 * breakdown than Dashboard for the same project.
 *
 * @param {Array}  baseRows  - output of useAllRows
 * @param {Array}  projects  - full project list (needed by computeContractorDriftProfile)
 * @param {Array}  reports   - full reports list
 * @param {Array}  siteVisits
 * @param {boolean} [useSCurve=false] - Monte Carlo deceleration model toggle (RiskDashboard)
 */
export function computeRiskRows(baseRows, projects, reports, siteVisits, useSCurve = false) {
  const driftCache = new Map();
  return baseRows.map(base => {
    const { project, latestReport, progress, projSiteVisits, sorted, riskScore, contScore } = base;

    // Engine-audit fix (2026-07-16): base.calculatedAt is the single
    // reference-time for this whole row (already threaded to Monte Carlo's
    // `asOf` below) — schedDev must use the same instant, not silently
    // default to a fresh `new Date()` at call time.
    const schedDev       = computeScheduleDeviation(project, progress, base.calculatedAt);
    const trend          = computeTrend(sorted);
    const escalations    = computeEscalations(sorted, projSiteVisits);
    const dims           = computeDimensionRisk(project, latestReport, riskScore, schedDev, contScore, projSiteVisits);
    const evolution      = computeWeeklyEvolution(sorted, project);
    const actions        = computeRecommendedActions(riskScore, contScore, schedDev, latestReport, projSiteVisits, project);
    const contractorName = project.generalContractor || latestReport?.contractor || "";
    const evm            = computeEVM(project, sorted, progress);

    let driftProfile;
    if (driftCache.has(contractorName)) {
      driftProfile = driftCache.get(contractorName);
    } else {
      driftProfile = computeContractorDriftProfile(projects, reports, siteVisits, contractorName);
      driftCache.set(contractorName, driftProfile);
    }

    const forecastOptions = { useSCurve, asOf: base.calculatedAt };
    const monteCarlo = computeMonteCarloForecast(project, sorted, null, forecastOptions);

    // A2: bias risk factor is additive and forwarded as its own field - it
    // never mutates riskScore.score/level, so Dashboard (useAllRows) and
    // RiskDashboard keep showing the same canonical riskScore. adjustedRiskScore/
    // adjustedRiskLevel below are a SEPARATE, opt-in view, same pattern as
    // monteCarlo.adjusted - nothing here is the single source of truth for risk.
    const driftRiskFactor = computeDriftRiskFactor(driftProfile);
    const { score: adjustedRiskScore, level: adjustedRiskLevel } = computeAdjustedRisk(riskScore, driftRiskFactor);

    // Adjusted Monte Carlo: only once the contractor's bias estimate is
    // reliable (n>=3) - same series computeMonteCarloForecast would derive
    // internally, run back through computeAdjustedProgress() per point.
    let adjustedMonteCarlo = null;
    if (driftProfile?.reliable && !monteCarlo.insufficient_data) {
      const overrideProgressPoints = sorted.map((_, i) =>
        computeAdjustedProgress(progressAtIndex(sorted, i), driftProfile.biasEwma, driftProfile.sampleCount)
      );
      adjustedMonteCarlo = computeMonteCarloForecast(project, sorted, null, { ...forecastOptions, overrideProgressPoints });
    }
    if (adjustedMonteCarlo) monteCarlo.adjusted = adjustedMonteCarlo;

    // confidence, contScore, health all come from base (single source of truth)
    return { ...base, schedDev, trend, escalations, dims, evolution, actions, contractorName, evm, driftProfile, monteCarlo, driftRiskFactor, adjustedRiskScore, adjustedRiskLevel };
  });
}
