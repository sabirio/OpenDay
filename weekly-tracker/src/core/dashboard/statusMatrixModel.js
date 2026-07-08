import { calculateProgressDelta } from '../../engines/progressDeltaEngine.js';

function currentPhaseLabel(row) {
  const { cumulativeStatuses, latestReport } = row;
  return cumulativeStatuses?.currentPhase || (Array.isArray(latestReport?.currentPhases) ? latestReport.currentPhases.join(' + ') : latestReport?.currentPhase);
}

export function buildStatusMatrixRows(rows, snapshotData = {}, snapshotMode = false) {
  return (rows ?? []).map((row) => {
    const { project, progress } = row;
    const snapRow = snapshotMode ? snapshotData[project.id] : null;
    const displayProgress = snapRow != null ? Math.round(snapRow.overall_progress) : progress;
    const noSnapData = snapshotMode && snapRow == null;
    const delta = !snapshotMode
      ? calculateProgressDelta(progress, project.progressHistory)
      : null;

    return {
      ...row,
      phase: currentPhaseLabel(row),
      displayProgress,
      noSnapData,
      delta,
    };
  });
}
