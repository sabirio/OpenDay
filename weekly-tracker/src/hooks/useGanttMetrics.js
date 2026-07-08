import { useState, useEffect } from 'react';
import { loadAllGanttMetrics, isGanttStale } from '../core/gantt/ganttOrchestrationModel';

/**
 * Loads Gantt SPI metrics for a list of projects.
 * Returns a Map<projectId, { spi, spiStatus, ... }>.
 * Errors are non-fatal — the map stays empty and a console warning is emitted.
 *
 * @param {Array}   projects  — project list
 * @param {boolean} enabled   — set false to defer loading until the caller is ready (lazy)
 */
export function useGanttMetrics(projects, enabled = true) {
  const [ganttMetrics, setGanttMetrics] = useState(new Map());

  useEffect(() => {
    if (!enabled) return;
    if (!projects || projects.length === 0) return;
    if (ganttMetrics.size > 0) return;
    loadAllGanttMetrics(projects.map(p => p.id))
      .then(metricsMap => {
        const enriched = new Map();
        for (const [pid, metrics] of metricsMap) {
          const project = projects.find(p => p.id === pid);
          enriched.set(pid, { ...metrics, isStale: isGanttStale(project) });
        }
        setGanttMetrics(enriched);
      })
      .catch(err => console.warn('[useGanttMetrics] failed:', err));
  }, [projects, enabled]);

  return ganttMetrics;
}
