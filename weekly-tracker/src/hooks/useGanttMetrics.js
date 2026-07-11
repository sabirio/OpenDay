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
  // `result.key` is the exact set of project ids the loaded metrics belong
  // to — caching/re-fetch decisions are keyed on that, not on the previous
  // `ganttMetrics.size > 0` check: that guard meant switching to a
  // *different* project set while stale metrics from a prior set were
  // still cached would never re-fetch at all, since "size > 0" was already
  // true. The effect can still re-run when `projects` gets a new array
  // reference with the same ids (same as before this fix) — the
  // `result.key === idsKey` guard inside makes that a harmless no-op
  // rather than a real re-fetch.
  const [result, setResult] = useState({ key: null, metrics: new Map() });
  const idsKey = projects && projects.length > 0 ? projects.map(p => p.id).join(',') : null;

  useEffect(() => {
    if (!enabled || !idsKey || result.key === idsKey) return;
    let alive = true;
    loadAllGanttMetrics(projects.map(p => p.id))
      .then(metricsMap => {
        if (!alive) return;
        const enriched = new Map();
        for (const [pid, metrics] of metricsMap) {
          const project = projects.find(p => p.id === pid);
          enriched.set(pid, { ...metrics, isStale: isGanttStale(project) });
        }
        setResult({ key: idsKey, metrics: enriched });
      })
      .catch(err => console.warn('[useGanttMetrics] failed:', err));
    return () => { alive = false; };
  }, [projects, enabled, idsKey, result.key]);

  return result.key === idsKey ? result.metrics : new Map();
}
