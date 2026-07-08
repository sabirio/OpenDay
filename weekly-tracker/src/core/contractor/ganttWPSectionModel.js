import {
  calculatePhaseAverageProgressWithOverrides,
  getDefaultProgressForGanttStatus,
} from '../../engines/progressEngine.js';

export function buildGanttWPSectionModel(tasks, ganttWpProgress) {
  const phasePct = calculatePhaseAverageProgressWithOverrides(tasks, ganttWpProgress);
  return {
    phasePct,
    allComplete: phasePct === 100,
  };
}

export function getGanttStatusDefaultProgress(status, currentProgress) {
  return getDefaultProgressForGanttStatus(status, currentProgress);
}
