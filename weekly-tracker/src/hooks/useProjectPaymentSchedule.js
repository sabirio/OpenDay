import { useCallback, useEffect, useState } from 'react';
import { commitPaymentCertificationDecision, commitPaymentCertificationEvidence, commitPaymentRetentionRelease, commitPaymentRetentionTerms, commitPaymentSchedule, commitPaymentScheduleActivation, commitPaymentTrackingEvent, loadProjectPaymentSchedule } from '../core/payments/paymentScheduleOrchestration.js';

export function useProjectPaymentSchedule(projectId) {
  const [state, setState] = useState({ status: 'loading', workspace: null, error: null });
  const [busy, setBusy] = useState(false);
  const [selectedCommitmentId, setSelectedCommitmentId] = useState(null);
  const load = useCallback(async () => {
    try { const workspace = await loadProjectPaymentSchedule(projectId, selectedCommitmentId); setSelectedCommitmentId(workspace.selectedCommitmentId || null); setState({ status: 'ready', workspace, error: null }); }
    catch (error) { setState({ status: 'error', workspace: null, error }); }
  }, [projectId, selectedCommitmentId]);
  useEffect(() => {
    let active = true;
    loadProjectPaymentSchedule(projectId, null)
      .then(workspace => { if (active) { setSelectedCommitmentId(workspace.selectedCommitmentId || null); setState({ status: 'ready', workspace, error: null }); } })
      .catch(error => { if (active) setState({ status: 'error', workspace: null, error }); });
    return () => { active = false; };
  }, [projectId]);
  const run = async command => { setBusy(true); try { const result = await command(); await load(); return result; } finally { setBusy(false); } };
  const selectCommitment = async commitmentId => { setBusy(true); try { const workspace = await loadProjectPaymentSchedule(projectId, commitmentId); setSelectedCommitmentId(commitmentId); setState({ status: 'ready', workspace, error: null }); } catch (error) { setState({ status: 'error', workspace: null, error }); } finally { setBusy(false); } };
  return { ...state, busy, selectedCommitmentId, selectCommitment, retry: load, save: (id, mode, rows) => run(() => commitPaymentSchedule(projectId, selectedCommitmentId, id, mode, rows)), activate: id => run(() => commitPaymentScheduleActivation(id)), openCertification: (milestoneId, documents, evidenceNote) => run(() => commitPaymentCertificationEvidence(milestoneId, documents, evidenceNote)), decideCertification: (caseId, decisionType, certifiedAmount, decisionReason) => run(() => commitPaymentCertificationDecision(caseId, decisionType, certifiedAmount, decisionReason)), recordPayment: (caseId, eventType, amount, reference, date, note) => run(() => commitPaymentTrackingEvent(caseId, eventType, amount, reference, date, note)), saveRetention: (scheduleId, percentage, condition) => run(() => commitPaymentRetentionTerms(scheduleId, percentage, condition)), releaseRetention: (scheduleId, reference, date, note) => run(() => commitPaymentRetentionRelease(scheduleId, reference, date, note)) };
}
