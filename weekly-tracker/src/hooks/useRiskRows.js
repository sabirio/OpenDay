import { useMemo } from 'react';
import { useAllRows } from './useAllRows.js';
import { computeRiskRows } from './computeRiskRows.js';

export { computeRiskRows } from './computeRiskRows.js';

/**
 * Layered hook: base rows (useAllRows) → risk-augmented rows.
 * riskScore is forwarded from base — computeProjectRiskScore is NOT called again.
 */
export function useRiskRows(projects, reports, siteVisits = []) {
  const baseRows = useAllRows(projects, reports, siteVisits);
  return useMemo(
    () => computeRiskRows(baseRows, projects, reports, siteVisits),
    [baseRows, projects, reports, siteVisits],
  );
}
