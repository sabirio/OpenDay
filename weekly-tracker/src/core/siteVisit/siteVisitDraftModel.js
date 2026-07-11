import { buildWorkflowDraftKey, findWorkflowDraft, inspectWorkflowDraft, removeWorkflowDraft, saveWorkflowDraft } from '../workflow/workflowDraftStore.js';
export const SITE_VISIT_DRAFT_VERSION = 1;
const workflowType = 'site-visit';

export function buildSiteVisitDraft(input, now = new Date()) {
  const timestamp = now.toISOString();
  const contextId = `${input.visitDate}:${input.contractorReportId || 'no-report'}`;
  return { schemaVersion: SITE_VISIT_DRAFT_VERSION, workflowType, contextId, userId: String(input.userId), projectId: String(input.projectId), visitDate: input.visitDate, contractorReportId: input.contractorReportId || null, clientRequestId: input.clientRequestId, formData: input.formData, observations: input.observations || {}, evidenceItems: (input.evidenceItems || []).map(path => typeof path === 'string' ? { path, status: 'uploaded' } : path).filter(item => item?.path), currentItemId: input.currentItemId || null, currentGroupId: input.currentGroupId || null, activeFilter: input.activeFilter || 'all', createdAt: input.createdAt || timestamp, updatedAt: timestamp };
}

const identityFor = input => ({ workflowType, schemaVersion: SITE_VISIT_DRAFT_VERSION, userId: input.userId, projectId: input.projectId });
const normalize = draft => ({ ...draft, evidenceItems: (draft.evidenceItems || []).filter(item => item?.path).map(item => ({ path: item.path, status: 'uploaded' })) });
export const buildSiteVisitDraftKey = draft => buildWorkflowDraftKey(draft);
export const inspectSiteVisitDraft = (raw, identity, now) => inspectWorkflowDraft(raw, identityFor(identity), normalize, now);
export const findSiteVisitDraft = (storage, identity, now) => findWorkflowDraft(storage, identityFor(identity), normalize, `sitevisit_draft_${identity.projectId}`, now);
export { removeWorkflowDraft as removeSiteVisitDraft, saveWorkflowDraft as saveSiteVisitDraft };
