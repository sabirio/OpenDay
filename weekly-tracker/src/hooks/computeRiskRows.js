import { computeScheduleDeviation, computeTrend, computeDimensionRisk, computeWeeklyEvolution } from '../engines/riskEngine';
import { computeProjectHealth } from '../engines/projectHealthEngine';
import { computeContractorScores } from '../engines/contractorEngine';
import { computeEscalations } from '../engines/escalationEngine';
import { computeRecommendedActions } from '../engines/actionEngine';
import { computeEVM } from '../engines/evmEngine';
import { computeContractorDriftProfile } from '../engines/contractorDriftEngine';
import { computeMonteCarloForecast } from '../engines/monteCarloEngine';

/**
 * Pure mapping from base rows → risk-augmented rows.
 * riskScore is forwarded from base — computeProjectRiskScore is NOT called again.
 *
 * @param {Array}  baseRows  — output of useAllRows
 * @param {Array}  projects  — full project list (needed by computeContractorDriftProfile)
 * @param {Array}  reports   — full reports list
 * @param {Array}  siteVisits
 */
export function computeRiskRows(baseRows, projects, reports, siteVisits) {
  const driftCache = new Map();
  return baseRows.map(base => {
    const { project, latestReport, progress, projReports, projSiteVisits, sorted, riskScore } = base;

    const schedDev       = computeScheduleDeviation(project, progress);
    const trend          = computeTrend(sorted);
    const contScore      = computeContractorScores(project, projReports, projSiteVisits);
    const escalations    = computeEscalations(sorted, projSiteVisits);
    const dims           = computeDimensionRisk(project, latestReport, riskScore, schedDev, contScore, projSiteVisits);
    const evolution      = computeWeeklyEvolution(sorted, project);
    const actions        = computeRecommendedActions(riskScore, contScore, schedDev, latestReport, projSiteVisits, project);
    const health         = computeProjectHealth(riskScore, progress, contScore);
    const contractorName = project.generalContractor || latestReport?.contractor || "";
    const evm            = computeEVM(project, sorted, progress);

    let driftProfile;
    if (driftCache.has(contractorName)) {
      driftProfile = driftCache.get(contractorName);
    } else {
      driftProfile = computeContractorDriftProfile(projects, reports, siteVisits, contractorName);
      driftCache.set(contractorName, driftProfile);
    }

    const monteCarlo = computeMonteCarloForecast(project, sorted, null);

    // confidence comes from base (computed in useAllRows — single source of truth)
    return { ...base, schedDev, trend, contScore, escalations, dims, evolution, actions, health, contractorName, evm, driftProfile, monteCarlo };
  });
}
