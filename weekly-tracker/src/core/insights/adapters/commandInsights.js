/**
 * Map commandEngine.getCommands output → Insight[].
 * Pure function — no engine imports.
 *
 * @param {Array<{id:string, severity:string, title:string, reason:string, action:string, projectCode:string}>} commands
 * @param {Record<string,string>} codeToId  — { storeCode: projectId }, built by caller
 * @returns {import('../insight.js').Insight[]}
 */
export function commandsToInsights(commands, codeToId = {}) {
  return commands.map(c => ({
    id:                `command:${c.projectCode}:${c.id}`,
    source:            'command',
    severity:          c.severity,
    scope:             'project',
    projectId:         codeToId[c.projectCode] ?? null,
    title:             c.title,
    detail:            c.reason,
    recommendedAction: c.action,
    priorityScore:     c.severity === 'critical' ? 0 : c.severity === 'warning' ? 1 : 2,
  }));
}
