import { useMemo } from 'react';
import {
  buildGanttWPSectionModel,
  getGanttStatusDefaultProgress,
} from '../core/contractor/ganttWPSectionModel.js';

export function useGanttWPSectionModel(tasks, ganttWpProgress) {
  return useMemo(
    () => buildGanttWPSectionModel(tasks, ganttWpProgress),
    [tasks, ganttWpProgress]
  );
}

export function useGanttStatusDefaultProgress() {
  return getGanttStatusDefaultProgress;
}
