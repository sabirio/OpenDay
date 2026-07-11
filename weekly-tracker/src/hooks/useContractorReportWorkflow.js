import { useReducer } from 'react';
import { contractorWorkflowReducer, createContractorWorkflowState, hasPendingUploads } from '../core/contractorReport/contractorWorkflowState.js';
export { buildContractorDraftEnvelope, findContractorDraft, removeContractorDraft, saveContractorDraft } from '../core/contractorReport/contractorDraftModel.js';

export function useContractorReportWorkflow(requestId) {
  const [state, dispatch] = useReducer(contractorWorkflowReducer, requestId, createContractorWorkflowState);
  return {
    state, dispatch,
    isSubmitting: state.status === 'submitting',
    isSubmitted: state.status === 'submitted',
    canRetry: state.status === 'retryable-error',
    submitBlocked: state.status === 'submitting' || state.status === 'submitted' || hasPendingUploads(state),
  };
}
