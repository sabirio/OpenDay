/** Pure PM approval presentation facts. PostgreSQL remains final authority. */
export function buildPmBaselineApprovalSummary(version, tasks = [], completeness = {}) {
  const isCanonical = Boolean(version?.executionScopeVersionId);
  const uniqueWorkGroupIds = new Set();
  let canonicalRowsComplete = true;

  for (const task of tasks) {
    if (isCanonical && (!task.scheduleActivityId || !task.workGroupIds?.length)) {
      canonicalRowsComplete = false;
    }
    for (const workGroupId of task.workGroupIds || []) uniqueWorkGroupIds.add(String(workGroupId));
  }

  const ready = version?.status === 'PENDING_REVIEW'
    && completeness?.isComplete === true
    && (!isCanonical || canonicalRowsComplete);

  return {
    ready,
    isCanonical,
    executionScopeVersionId: version?.executionScopeVersionId ?? null,
    activityCount: isCanonical ? tasks.length : null,
    workGroupCount: isCanonical ? uniqueWorkGroupIds.size : null,
    reason: ready
      ? null
      : 'The immutable submission snapshot is incomplete or unavailable. Reload before approving.',
  };
}
