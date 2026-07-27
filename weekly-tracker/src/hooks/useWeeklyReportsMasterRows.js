import { useMemo } from 'react';
import { buildWeeklyReportsMasterRows, describeReportContext } from '../core/weekly/weeklyReportsMasterRowModel.js';

export function useWeeklyReportsMasterRows(allRows) {
  return useMemo(() => buildWeeklyReportsMasterRows(allRows), [allRows]);
}

export { describeReportContext };
