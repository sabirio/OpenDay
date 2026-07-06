/**
 * @typedef {'critical'|'warning'|'info'|'positive'} InsightSeverity
 * @typedef {'project'|'portfolio'} InsightScope
 *
 * @typedef {object} Insight
 * @property {string}           id
 * @property {string}           source
 * @property {InsightSeverity}  severity
 * @property {InsightScope}     scope
 * @property {string}           projectId
 * @property {string}           title
 * @property {string}           detail
 * @property {string}           [recommendedAction]
 * @property {number}           priorityScore
 * @property {string[]}         [criticalBlockerTasks] - opening_at_risk only: named critical blockers
 * @property {string[]}         [softBlockerTasks] - opening_at_risk only: named soft blockers
 */

/**
 * Sort insights by priorityScore ascending (lower = more urgent), stable.
 * @param {Insight[]} list
 * @returns {Insight[]}
 */
export function sortInsights(list) {
  return [...list].sort((a, b) => a.priorityScore - b.priorityScore);
}
