import { useMemo } from 'react';
import { buildDashboardSummaryPanelModel } from '../core/dashboard/summaryPanelModel.js';

export function useDashboardSummaryPanelModel(rows, allRows) {
  return useMemo(
    () => buildDashboardSummaryPanelModel(rows ?? [], allRows ?? []),
    [rows, allRows]
  );
}
