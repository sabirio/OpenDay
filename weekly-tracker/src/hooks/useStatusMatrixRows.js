import { useMemo } from 'react';
import { buildStatusMatrixRows } from '../core/dashboard/statusMatrixModel.js';

export function useStatusMatrixRows(rows, snapshotData, snapshotMode) {
  return useMemo(
    () => buildStatusMatrixRows(rows, snapshotData, snapshotMode),
    [rows, snapshotData, snapshotMode]
  );
}
