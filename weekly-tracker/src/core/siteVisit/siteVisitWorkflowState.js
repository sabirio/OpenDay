export function createSiteVisitWorkflowState(requestId) { return { status: 'idle', requestId, draftStatus: 'none', draftUpdatedAt: null, currentItemId: null, currentGroupId: null, validationErrors: [], uploadItems: [], persistedSiteVisitId: null, idempotentReplay: false, dirty: false, formError: null, activeFilter: 'all' }; }
export function siteVisitWorkflowReducer(state, action) {
  switch (action.type) {
    case 'SOURCE_LOADING': return { ...state, status: 'loading-source' };
    case 'DRAFT_FOUND': return { ...state, status: 'restoring-draft', draftStatus: action.stale ? 'stale' : 'available', draftUpdatedAt: action.updatedAt || null };
    case 'DRAFT_RESTORED': return { ...state, status: 'editing', requestId: action.requestId, draftStatus: 'restored', currentItemId: action.currentItemId || null, currentGroupId: action.currentGroupId || null, activeFilter: action.activeFilter || 'all', dirty: true };
    case 'EDIT': return state.status === 'submitting' || state.status === 'submitted' ? state : { ...state, status: 'editing', dirty: true, validationErrors: [], formError: null };
    case 'NAVIGATE': return { ...state, currentItemId: action.itemId || null, currentGroupId: action.groupId || state.currentGroupId, activeFilter: action.filter || state.activeFilter, dirty: true };
    case 'UPLOADS_CHANGED': { const uploadItems = action.items || []; const pending = uploadItems.some(item => ['queued','compressing','uploading','finalizing'].includes(item.status)); return { ...state, uploadItems, status: pending ? 'uploading' : 'editing' }; }
    case 'VALIDATE': return state.status === 'submitting' ? state : { ...state, status: 'validating', validationErrors: [], formError: null };
    case 'VALIDATION_FAILED': return { ...state, status: 'validation-error', validationErrors: action.errors || [] };
    case 'REVIEW': return { ...state, status: 'reviewing' };
    case 'READY': return { ...state, status: 'ready' };
    case 'SUBMIT': return state.status === 'submitting' || state.status === 'submitted' ? state : { ...state, status: 'submitting', formError: null };
    case 'SUBMIT_FAILED': return { ...state, status: action.retryable ? 'retryable-error' : 'fatal-error', formError: action.error || 'Submission failed' };
    case 'SUBMIT_SUCCEEDED': return { ...state, status: 'submitted', persistedSiteVisitId: action.siteVisitId || null, idempotentReplay: action.idempotentReplay === true, dirty: false, draftStatus: 'cleared' };
    case 'RESET': return createSiteVisitWorkflowState(action.requestId || state.requestId);
    default: return state;
  }
}
export const hasPendingSiteVisitUploads = state => state.uploadItems.some(item => ['queued','compressing','uploading','finalizing'].includes(item.status));
