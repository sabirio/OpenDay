import { useState, useEffect } from 'react';
import { loadAllGanttMetrics } from '../services/ganttService';

/**
 * Loads Gantt SPI metrics for a list of projects.
 * Returns a Map<projectId, { spi, spiStatus, ... }>.
 * Errors are non-fatal — the map stays empty and a console warning is emitted.
 */
export function useGanttMetrics(projects) {
  const [ganttMetrics, setGanttMetrics] = useState(new Map());

  useEffect(() => {
    if (!projects || projects.length === 0) return;
    loadAllGanttMetrics(projects.map(p => p.id))
      .then(setGanttMetrics)
      .catch(err => console.warn('[useGanttMetrics] failed to load Gantt metrics:', err));
  }, [projects]);

  return ganttMetrics;
}
