import { useReducer } from 'react';
import { createSiteVisitWorkflowState, hasPendingSiteVisitUploads, siteVisitWorkflowReducer } from '../core/siteVisit/siteVisitWorkflowState.js';
export { buildSiteVisitDraft, findSiteVisitDraft, removeSiteVisitDraft, saveSiteVisitDraft } from '../core/siteVisit/siteVisitDraftModel.js';
export { filterSiteVisitTasks, resolveCurrentSiteVisitItem, selectSiteVisitNavigation, siteVisitReviewCounts } from '../core/siteVisit/siteVisitNavigationModel.js';
export { buildSiteVisitPhaseSectionModel } from '../core/siteVisit/siteVisitPhaseSectionModel.js';
export function useSiteVisitWorkflow(requestId) { const [state, dispatch] = useReducer(siteVisitWorkflowReducer, requestId, createSiteVisitWorkflowState); return { state, dispatch, isSubmitting: state.status === 'submitting', isSubmitted: state.status === 'submitted', canRetry: state.status === 'retryable-error', submitBlocked: state.status === 'submitting' || state.status === 'submitted' || hasPendingSiteVisitUploads(state) }; }
