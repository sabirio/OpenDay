import { computePortfolioContractorScores } from '../../engines/contractorEngine.js';
import { computeRiskSummaryStats } from '../../engines/portfolioRiskEngine.js';

export function computeRiskDashboardContractorScores(rows) {
  return computePortfolioContractorScores(rows);
}

export function computeRiskDashboardSummaryStats(rows) {
  return computeRiskSummaryStats(rows);
}
