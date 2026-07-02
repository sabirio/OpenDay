import { alertsToInsights }   from '../adapters/portfolioAlerts.js';
import { commandsToInsights } from '../adapters/commandInsights.js';
import { mergeInsights }      from '../merge.js';

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

  return mergeInsights(
    alertsToInsights(alerts),
    commandsToInsights(commands, codeToId),
  );
}

/**
 * Count insights by severity.
 * @param {import('../insight.js').Insight[]} insights
 * @returns {{ critical: number, warning: number, info: number, total: number }}
 */
export function summarizeInsights(insights) {
  const counts = { critical: 0, warning: 0, info: 0, positive: 0 };
  for (const ins of insights) {
    if (counts[ins.severity] !== undefined) counts[ins.severity]++;
  }
  return { ...counts, total: insights.length };
}
