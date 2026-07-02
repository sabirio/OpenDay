/**
 * confidenceModifier.js — apply data-confidence dampening to assembled insights.
 * Pure function — no engine imports.
 *
 * Rule (B — modifier):
 *   LOW confidence  → step severity down one level, +0.5 to priorityScore, attach badge.
 *   MEDIUM          → attach badge only (no severity/priority change).
 *   HIGH            → no change, no badge.
 *   'positive' severity is NEVER stepped down.
 *   Only project-scoped insights with a matching projectId are affected.
 *
 * @param {import('../insight.js').Insight[]} insights
 * @param {Record<string, {level:'HIGH'|'MEDIUM'|'LOW', label:string}>} confidenceByProjectId
 * @returns {import('../insight.js').Insight[]}
 */
export function applyConfidence(insights, confidenceByProjectId) {
  return insights.map(ins => {
    // Never dampen a confidence insight itself — that would be circular.
    if (ins.source === 'confidence') return ins;
    if (ins.scope !== 'project' || ins.projectId == null) return ins;

    const conf = confidenceByProjectId[ins.projectId];
    if (!conf) return ins;

    if (conf.level === 'HIGH') return ins;

    if (conf.level === 'MEDIUM') {
      return {
        ...ins,
        confidence: {
          level:  conf.level,
          label:  conf.label,
          reason: 'Indicative only — data coverage is partial',
        },
      };
    }

    // LOW — step down severity (never touch 'positive')
    if (ins.severity === 'positive') return ins;

    return {
      ...ins,
      severity:      stepDownSeverity(ins.severity),
      priorityScore: ins.priorityScore + 0.5,
      confidence: {
        level:  conf.level,
        label:  conf.label,
        reason: 'Severity dampened — insufficient submission history',
      },
    };
  });
}

function stepDownSeverity(sev) {
  if (sev === 'critical') return 'warning';
  if (sev === 'warning')  return 'info';
  return sev; // 'info' and 'positive' floor
}
