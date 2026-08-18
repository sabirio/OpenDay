const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildDefaultScheduleActivities(executionScope, createId = () => crypto.randomUUID()) {
  if (!executionScope?.id || !Array.isArray(executionScope.workGroups)) {
    throw Object.assign(new Error('EXECUTION_SCOPE_NOT_CONFIGURED'), { code: 'EXECUTION_SCOPE_NOT_CONFIGURED' });
  }
  return executionScope.workGroups.map(workGroup => ({
    activityId: createId(),
    title: workGroup.label,
    workGroupIds: [workGroup.id],
  }));
}

export function validateScheduleSetupActivities(activities, executionScope) {
  if (!Array.isArray(activities) || activities.length === 0) {
    return [{ code: 'EMPTY_SCHEDULE_SETUP' }];
  }
  const allowed = new Set(executionScope?.workGroupIds || []);
  const covered = new Set();
  const activityIds = new Set();
  const issues = [];

  activities.forEach((activity, index) => {
    if (!UUID_PATTERN.test(activity?.activityId || '')) {
      issues.push({ code: 'INVALID_SCHEDULE_ACTIVITY_ID', index });
    } else if (activityIds.has(activity.activityId)) {
      issues.push({ code: 'DUPLICATE_SCHEDULE_ACTIVITY_ID', index, referenceId: activity.activityId });
    } else {
      activityIds.add(activity.activityId);
    }
    if (typeof activity?.title !== 'string' || activity.title.trim().length === 0) {
      issues.push({ code: 'MISSING_SCHEDULE_ACTIVITY_TITLE', index });
    }
    if (!Array.isArray(activity?.workGroupIds) || activity.workGroupIds.length === 0) {
      issues.push({ code: 'EMPTY_SCHEDULE_ACTIVITY_WORK_GROUPS', index });
      return;
    }
    const local = new Set();
    for (const workGroupId of activity.workGroupIds) {
      if (local.has(workGroupId)) {
        issues.push({ code: 'DUPLICATE_ACTIVITY_WORK_GROUP', index, referenceId: workGroupId });
      }
      local.add(workGroupId);
      if (!allowed.has(workGroupId)) {
        issues.push({ code: 'WORK_GROUP_OUT_OF_EXECUTION_SCOPE', index, referenceId: workGroupId });
      } else {
        covered.add(workGroupId);
      }
    }
  });

  for (const workGroupId of allowed) {
    if (!covered.has(workGroupId)) {
      issues.push({ code: 'UNCOVERED_EXECUTION_SCOPE_WORK_GROUP', referenceId: workGroupId });
    }
  }
  return issues;
}

export function buildScheduleSetupSavePayload(activities, executionScope) {
  const issues = validateScheduleSetupActivities(activities, executionScope);
  if (issues.length > 0) {
    const error = new Error('INVALID_CONTRACTOR_SCHEDULE_SETUP');
    error.code = 'INVALID_CONTRACTOR_SCHEDULE_SETUP';
    error.issues = issues;
    throw error;
  }
  return activities.map((activity, sortOrder) => ({
    activityId: activity.activityId,
    title: activity.title.trim(),
    workGroupIds: [...activity.workGroupIds],
    sortOrder,
  }));
}
