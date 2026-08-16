export const CLARIFICATION_TYPES = ['COMMERCIAL', 'TECHNICAL', 'SCOPE', 'QUANTITY', 'MISSING_INFORMATION', 'OTHER'];
export const CLARIFICATION_SUBJECT_TYPES = ['TENDER', 'CATEGORY', 'LINE', 'CONTRACTOR', 'BID_ROUND'];

export function summarizeClarifications(items = []) {
  return {
    draft: items.filter(item => item.status === 'DRAFT').length,
    open: items.filter(item => ['OPEN', 'RESPONDED', 'REVISION_REQUIRED'].includes(item.status)).length,
    responded: items.filter(item => item.status === 'RESPONDED').length,
    accepted: items.filter(item => item.status === 'ACCEPTED').length,
    complete: items.filter(item => ['RESOLVED', 'CLOSED'].includes(item.status)).length,
    allComplete: items.length > 0 && items.every(item => ['RESOLVED', 'CLOSED'].includes(item.status)),
  };
}

export function validateClarificationDraft({ subjectType = 'LINE', lineId, workGroupId, type, comment }) {
  const issues = [];
  if (!CLARIFICATION_SUBJECT_TYPES.includes(subjectType)) issues.push('SUBJECT_REQUIRED');
  if (subjectType === 'LINE' && !lineId) issues.push('LINE_REQUIRED');
  if (subjectType === 'CATEGORY' && !workGroupId) issues.push('CATEGORY_REQUIRED');
  if (!CLARIFICATION_TYPES.includes(type)) issues.push('TYPE_REQUIRED');
  if (!comment?.trim()) issues.push('COMMENT_REQUIRED');
  if ((comment?.trim().length || 0) > 4000) issues.push('COMMENT_TOO_LONG');
  return issues;
}

export function buildClarificationSubjectOptions(submission) {
  const items = submission?.items || [];
  const categories = [];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.workGroupId)) continue;
    seen.add(item.workGroupId);
    categories.push({ id: item.workGroupId, label: `${item.workGroupCode} · ${item.workGroupLabel}` });
  }
  return {
    categories,
    lines: items.map(item => ({ id: item.lineId, workGroupId: item.workGroupId, label: `${item.workGroupCode} · ${item.description}` })),
  };
}
