import { alertsToInsights }     from '../adapters/portfolioAlerts.js';
import { commandsToInsights }   from '../adapters/commandInsights.js';
import { confidenceToInsights } from '../adapters/confidenceInsights.js';
import { applyConfidence }      from '../adapters/confidenceModifier.js';
import { mergeInsights }        from '../merge.js';
import { sortInsights }         from '../insight.js';

/**
 * Build the merged, sorted insight list for the Home page.
 * Pure function — does NOT call any engine; consumes already-computed outputs.
 *
 * @param {{ rows: Array, alerts: Array, commands: Array, projects: Array }} param0
 * @returns {import('../insight.js').Insight[]}
 */
export function buildHomeInsights({ rows, alerts, commands, projects }) {
  const codeToId = projects.reduce((acc, p) => {
    if (p.storeCode) acc[p.storeCode] = p.id;
    return acc;
  }, {});

  // Build confidence lookup keyed by projectId (UUID).
  // rows come from useAllRows which computes confidence per project.
  const confidenceByProjectId = rows.reduce((acc, row) => {
    if (row.project?.id && row.confidence) {
      acc[row.project.id] = row.confidence;
    }
    return acc;
  }, {});

  const merged = mergeInsights(
    alertsToInsights(alerts),
    commandsToInsights(commands, codeToId),
    confidenceToInsights(rows),
  );

  // applyConfidence may change priorityScore values — re-sort after.
  return sortInsights(applyConfidence(merged, confidenceByProjectId));
}

/**
 * Count insights by severity.
 * @param {import('../insight.js').Insight[]} insights
 * @returns {{ critical: number, warning: number, info: number, positive: number, total: number }}
 */
export function summarizeInsights(insights) {
  const counts = { critical: 0, warning: 0, info: 0, positive: 0 };
  for (const ins of insights) {
    if (counts[ins.severity] !== undefined) counts[ins.severity]++;
  }
  return { ...counts, total: insights.length };
}
