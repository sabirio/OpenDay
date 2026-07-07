/**
 * Contractor reliability score from PM/GC discrepancy records.
 * Source of truth: score = 1 - critical discrepancies / total discrepancies.
 */

export function computeContractorReliability(projectIds, discrepancies = []) {
  if (!projectIds || projectIds.length === 0) return new Map();

  const byProject = new Map();
  for (const d of discrepancies || []) {
    const projectId = d.project_id ?? d.projectId;
    if (!byProject.has(projectId)) byProject.set(projectId, { ok: 0, warning: 0, critical: 0 });
    const bucket = byProject.get(projectId);
    if      (d.status === 'critical') bucket.critical++;
    else if (d.status === 'warning')  bucket.warning++;
    else                              bucket.ok++;
  }

  const result = new Map();
  for (const pid of projectIds) {
    const b     = byProject.get(pid) || { ok: 0, warning: 0, critical: 0 };
    const total = b.ok + b.warning + b.critical;
    result.set(pid, {
      ...b,
      total,
      score: total > 0 ? Math.round((1 - b.critical / total) * 100) : null,
    });
  }
  return result;
}
