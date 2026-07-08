import { useMemo } from 'react';
import { buildProjectDetailDrawerModel } from '../core/dashboard/projectDetailDrawerModel.js';

export function useProjectDetailDrawerModel(row, projSiteVisits) {
  return useMemo(
    () => buildProjectDetailDrawerModel(row, projSiteVisits),
    [row, projSiteVisits]
  );
}
