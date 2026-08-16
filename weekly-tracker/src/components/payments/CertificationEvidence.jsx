import { useState } from 'react';
import { usePaymentCertificationEvidencePresentation } from '../../hooks/usePaymentCertificationEvidencePresentation.js';

const pct = value => value == null ? 'Not available' : `${Number(value).toFixed(2)}%`;
const money = (value, currency) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency || ''}`;

function DecisionControls({ item, editor, toast }) {
  const [decisionType, setDecisionType] = useState(item.evidence.evidenceReady && item.status !== 'HELD' ? 'FULL' : 'PARTIAL');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const submit = async () => {
    const certifiedAmount = decisionType === 'FULL' ? item.plannedAmount : decisionType === 'HELD' ? 0 : amount;
    try { await editor.decideCertification(item.certificationCaseId, decisionType, certifiedAmount, reason); toast.success(`Certification decision recorded: ${decisionType}.`); }
    catch (error) { toast.error(error.message); }
  };
  return <div className="variation-grid"><label>Decision<select value={decisionType} onChange={event => setDecisionType(event.target.value)}>{item.evidence.evidenceReady && <option value="FULL">Certify full</option>}<option value="PARTIAL">Certify partial</option>{item.status !== 'HELD' && <option value="HELD">Hold certification</option>}</select></label>{decisionType === 'PARTIAL' && <label>Certified amount<input type="number" min="0.01" max={item.plannedAmount} value={amount} onChange={event => setAmount(event.target.value)}/></label>}<label>Decision rationale<textarea rows="2" maxLength="3000" value={reason} onChange={event => setReason(event.target.value)}/></label><button className="btn btn-primary" disabled={editor.busy || !reason.trim() || (decisionType === 'PARTIAL' && !amount)} onClick={submit}>Record immutable decision</button></div>;
}

export default function CertificationEvidence({ workspace, editor, toast }) {
  const presentation = usePaymentCertificationEvidencePresentation();
  const [milestoneId, setMilestoneId] = useState('');
  const [documents, setDocuments] = useState('');
  const [note, setNote] = useState('');
  const candidates = workspace.schedule?.milestones?.filter(item => ['UPCOMING', 'READY_FOR_REVIEW'].includes(item.status)) || [];
  const open = async () => {
    try {
      await editor.openCertification(milestoneId, presentation.parseDocumentReferences(documents), note);
      setMilestoneId(''); setDocuments(''); setNote(''); toast.success('Immutable certification evidence captured.');
    } catch (error) { toast.error(error.message); }
  };
  return <section className="variation-workspace"><h2>Certification evidence</h2><p>Each case freezes the evidence available when certification starts.</p>
    {workspace.canManage && candidates.length > 0 && <article className="variation-card"><label>Milestone<select value={milestoneId} onChange={event => setMilestoneId(event.target.value)}><option value="">Select milestone</option>{candidates.map(item => <option key={item.milestoneId} value={item.milestoneId}>{item.sequenceNumber}. {item.title}</option>)}</select></label><label>Document references (one per line)<textarea rows="3" value={documents} onChange={event => setDocuments(event.target.value)}/></label><label>Evidence note<textarea rows="3" maxLength="3000" value={note} onChange={event => setNote(event.target.value)}/></label><button className="btn btn-primary" disabled={editor.busy || !milestoneId || !documents.trim()} onClick={open}>Open certification case</button></article>}
    {(workspace.paymentCertifications?.cases || []).map(item => <article className="variation-card" key={item.certificationCaseId}><h3>Case #{item.caseNumber}: {item.milestoneTitle}</h3><strong>{item.status} · {item.evidence.evidenceReady ? 'Evidence ready' : 'Evidence incomplete'}</strong><p>{money(item.plannedAmount, item.currencyCode)} · required {pct(item.evidence.requiredProgress)} · PM verified {pct(item.evidence.pmVerifiedProgress)}</p><p>Contractor {pct(item.evidence.contractorReportedProgress)} · schedule {pct(item.evidence.scheduleProgress)} · critical blockers {item.evidence.openCriticalIssueCount} · open snags {item.evidence.openSnagCount}</p><p>Pending variations: {item.evidence.pendingVariationCount} / {money(item.evidence.pendingVariationExposure, item.currencyCode)}</p><p>BOQ quantity evidence: {item.evidence.boqQuantityEvidenceAvailable ? pct(item.evidence.boqQuantityProgress) : 'not available for this snapshot'}</p><p>{item.evidence.documents.length} document reference(s) · captured {new Date(item.evidence.capturedAt).toLocaleString()}</p>{item.evidence.evidenceNote && <p>{item.evidence.evidenceNote}</p>}{(item.decisions || []).map(decision => <p key={decision.decisionId}><strong>Decision #{decision.decisionNumber}: {decision.decisionType}</strong> · certified {money(decision.certifiedAmount, item.currencyCode)} · held {money(decision.heldAmount, item.currencyCode)} · {decision.decisionReason}</p>)}{workspace.canManage && ['UNDER_CERTIFICATION', 'HELD'].includes(item.status) && <DecisionControls item={item} editor={editor} toast={toast}/>}</article>)}
  </section>;
}
