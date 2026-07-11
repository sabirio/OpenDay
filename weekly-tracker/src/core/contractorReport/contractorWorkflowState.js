export const CONTRACTOR_WORKFLOW_STATUSES = Object.freeze([
  'idle', 'restoring-draft', 'editing', 'validating', 'validation-error',
  'uploading', 'ready', 'submitting', 'submitted', 'retryable-error', 'fatal-error',
]);

export function createContractorWorkflowState(requestId) {
  return {
    status: 'idle', requestId, draftStatus: 'none', draftUpdatedAt: null,
    persistedReportId: null, idempotentReplay: false, fieldErrors: [],
    formError: null, uploadItems: [], dirty: false, submitAttempted: false,
  };
}

export function contractorWorkflowReducer(state, action) {
  switch (action.type) {
    case 'DRAFT_FOUND':
      return { ...state, status: 'restoring-draft', draftStatus: action.stale ? 'stale' : 'available', draftUpdatedAt: action.updatedAt || null };
    case 'DRAFT_RESTORED':
      return { ...state, status: 'editing', requestId: action.requestId || state.requestId, draftStatus: 'restored', draftUpdatedAt: action.updatedAt || state.draftUpdatedAt, dirty: true };
    case 'DRAFT_DISMISSED':
      return { ...state, status: 'editing', draftStatus: 'dismissed' };
    case 'EDIT':
      if (state.status === 'submitting' || state.status === 'submitted') return state;
      return { ...state, status: 'editing', dirty: true, fieldErrors: [], formError: null };
    case 'UPLOADS_CHANGED': {
      const items = action.items || [];
      const pending = items.some(item => item.status === 'queued' || item.status === 'compressing' || item.status === 'uploading' || item.status === 'finalizing');
      return { ...state, uploadItems: items, status: pending ? 'uploading' : (state.dirty ? 'editing' : 'ready') };
    }
    case 'VALIDATE':
      if (state.status === 'submitting') return state;
      return { ...state, status: 'validating', submitAttempted: true, fieldErrors: [], formError: null };
    case 'VALIDATION_FAILED':
      return { ...state, status: 'validation-error', fieldErrors: action.errors || [], formError: null };
    case 'READY':
      return { ...state, status: 'ready', fieldErrors: [], formError: null };
    case 'SUBMIT':
      if (state.status === 'submitting' || state.status === 'submitted') return state;
      return { ...state, status: 'submitting', submitAttempted: true, formError: null };
    case 'SUBMIT_FAILED':
      return { ...state, status: action.retryable ? 'retryable-error' : 'fatal-error', formError: action.error || 'Submission failed' };
    case 'SUBMIT_SUCCEEDED':
      return { ...state, status: 'submitted', persistedReportId: action.reportId || null, idempotentReplay: action.idempotentReplay === true, draftStatus: 'cleared', dirty: false, formError: null };
    case 'RETRY':
      if (state.status !== 'retryable-error') return state;
      return { ...state, status: 'submitting', formError: null };
    case 'RESET':
      return createContractorWorkflowState(action.requestId || state.requestId);
    default:
      return state;
  }
}

export function hasPendingUploads(state) {
  return state.uploadItems.some(item => ['queued', 'compressing', 'uploading', 'finalizing'].includes(item.status));
}
