import { buildPmBaselineApprovalSummary } from '../core/schedule/pmBaselineApprovalModel.js';

/** UI-layer facade for the pure PM baseline approval presentation model. */
export function usePmBaselineApprovalSummary(version, tasks, completeness) {
  return buildPmBaselineApprovalSummary(version, tasks, completeness);
}
