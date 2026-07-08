/**
 * Presentation-facing progress helpers — thin core facade over
 * engines/progressEngine.js so pages/components/hooks (which must not
 * import engines/ directly) can reach these pure, render-time-safe
 * calculations via UI -> hooks -> core -> engines.
 */
export {
  calculateWPTaskWeightedProgress,
  getWPStatusTier,
  getDefaultProgressForGanttStatus,
  calculateGanttPhaseAverageProgress,
} from '../../engines/progressEngine';
