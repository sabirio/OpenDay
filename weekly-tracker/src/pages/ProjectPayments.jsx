import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjectPaymentSchedule } from '../hooks/useProjectPaymentSchedule.js';
import { usePaymentSchedulePresentation } from '../hooks/usePaymentSchedulePresentation.js';
import { useToast } from '../components/shared/Toast.jsx';
import PaymentNotifications from '../components/payments/PaymentNotifications.jsx';
import CertificationEvidence from '../components/payments/CertificationEvidence.jsx';
import PaymentTracking from '../components/payments/PaymentTracking.jsx';
import RetentionPanel from '../components/payments/RetentionPanel.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useProjectReturnHref } from '../hooks/useProjectReturnHref.js';

const blank = () => ({ milestoneId: crypto.randomUUID(), title: '', plannedDate: '', percentage: '', condition: '' });
const money = (value, currency) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency || ''}`;

function PaymentStep({ number, title, description, badge, open = false, children }) {
  return <details className="payment-step" open={open}>
    <summary><span className="payment-step-number">{number}</span><div><strong>{title}</strong><small>{description}</small></div>{badge && <span className="payment-step-badge">{badge}</span>}</summary>
    <div className="payment-step-body">{children}</div>
  </details>;
}

function ScheduleEditor({ workspace, editor, toast }) {
  const existing = workspace.schedule;
  const [scheduleId, setScheduleId] = useState(existing?.status === 'DRAFT' ? existing.paymentScheduleId : crypto.randomUUID());
  const [mode, setMode] = useState(existing?.mode || 'MILESTONE');
  const [rows, setRows] = useState(existing?.milestones?.length ? existing.milestones.map(item => ({ ...item })) : [blank()]);
  const presentation = usePaymentSchedulePresentation(rows, workspace.commitment);
  const update = (index, key, value) => setRows(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const save = async () => { try { await editor.save(scheduleId, mode, rows); toast.success('Payment schedule draft saved.'); } catch (error) { toast.error(error.message); } };
  const activate = async () => { try { await editor.activate(scheduleId); toast.success('Payment schedule activated.'); } catch (error) { toast.error(error.message); } };
  const startVersion = () => { setScheduleId(crypto.randomUUID()); setRows(existing.milestones.map(item => ({ ...item, milestoneId: crypto.randomUUID() }))); };
  return <section className="payment-schedule-editor">
    <div className="payment-schedule-toolbar"><label>Certification mode<select value={mode} onChange={event => setMode(event.target.value)}><option value="MILESTONE">Simple / milestone-based</option><option value="MEASURED_BOQ">Measured / BOQ quantity-based</option></select></label><div><span>Scheduled</span><strong>{presentation.scheduledPercentage}% · {money(presentation.scheduledAmount, workspace.commitment?.currencyCode)}</strong></div></div>
    <div className="payment-table-wrap"><table className="payment-table payment-editor-table"><thead><tr><th>Milestone</th><th>Planned date</th><th>Percentage</th><th>Planned amount</th><th>Payment condition</th><th/></tr></thead><tbody>{rows.map((row, index) => <tr key={row.milestoneId}><td><input aria-label={`Milestone ${index + 1}`} value={row.title} onChange={event => update(index, 'title', event.target.value)}/></td><td><input aria-label={`Planned date ${index + 1}`} type="date" value={row.plannedDate} onChange={event => update(index, 'plannedDate', event.target.value)}/></td><td><input aria-label={`Percentage ${index + 1}`} className="payment-number-input" type="number" min="0.0001" max="100" value={row.percentage} onChange={event => update(index, 'percentage', event.target.value)}/></td><td><input aria-label={`Planned amount ${index + 1}`} readOnly value={money(presentation.amountForPercentage(row.percentage), workspace.commitment?.currencyCode)}/></td><td><textarea aria-label={`Payment condition ${index + 1}`} rows="2" value={row.condition} onChange={event => update(index, 'condition', event.target.value)}/></td><td><button className="btn btn-danger" onClick={() => setRows(current => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></td></tr>)}</tbody></table></div>
    <div className="payment-schedule-actions"><button className="btn" onClick={() => setRows(current => [...current, blank()])}>Add milestone</button><button className="btn btn-primary" disabled={editor.busy || presentation.scheduledPercentage > 100 || !rows.length} onClick={save}>Save draft</button>{existing?.status === 'DRAFT' && existing.paymentScheduleId === scheduleId && <button className="btn btn-success" disabled={editor.busy} onClick={activate}>Activate schedule</button>}{existing?.status === 'ACTIVE' && <button className="btn" onClick={startVersion}>Start new version</button>}</div>
  </section>;
}

function ReadOnlySchedule({ workspace }) {
  return <section className="payment-schedule-editor"><div className="payment-table-wrap"><table className="payment-table"><thead><tr><th>#</th><th>Milestone</th><th>Planned date</th><th>Percentage</th><th>Planned amount</th><th>Status</th><th>Condition</th></tr></thead><tbody>{workspace.schedule?.milestones?.map(milestone => <tr key={milestone.milestoneId}><td>{milestone.sequenceNumber}</td><td>{milestone.title}</td><td>{milestone.plannedDate}</td><td>{milestone.percentage}%</td><td>{money(milestone.plannedAmount, workspace.schedule.currencyCode)}</td><td>{milestone.status}</td><td>{milestone.condition}</td></tr>)}</tbody></table></div></section>;
}

export default function ProjectPayments() {
  const { projectId } = useParams();
  const editor = useProjectPaymentSchedule(projectId);
  const toast = useToast();
  const { role } = useAuth();
  const projectBackHref = useProjectReturnHref(projectId, 'commercial');
  const backHref = role === 'Contractor' ? '/contractor-select' : projectBackHref;

  if (editor.status === 'loading') return <main className="variation-page" role="status">Loading payment schedule…</main>;
  if (editor.status === 'error') return <main className="variation-page"><h2>Payment schedule could not be loaded</h2><p>{editor.error?.message}</p><button className="btn" onClick={editor.retry}>Retry</button></main>;

  const workspace = editor.workspace;
  return <main className="variation-page commercial-flow-page">
    <header className="variation-page-header commercial-page-header"><div><Link to={backHref}>← Back</Link><h1>Payment Schedule</h1><p>One ordered workspace for schedule, retention, certification and external payment tracking. OpenDay does not transfer money.</p></div>{workspace.commitment && <div className="payment-header-total"><span>Contract value</span><strong>{money(workspace.commitment.contractValue, workspace.commitment.currencyCode)}</strong></div>}</header>
    {workspace.commitments?.length > 0 && <section className="payment-commitment-selector card"><label>Commitment / Cost Package<select value={workspace.selectedCommitmentId || ''} disabled={editor.busy} onChange={event => editor.selectCommitment(event.target.value)}>{workspace.commitments.map(item => <option key={item.commitmentId} value={item.commitmentId}>{item.costPackageCode} — {item.costPackageName} — {item.counterpartyName}</option>)}</select></label>{workspace.legacyUnmappedScheduleCount > 0 && <p>{workspace.legacyUnmappedScheduleCount} legacy schedule(s) need manual Commitment mapping.</p>}</section>}
    <PaymentNotifications model={workspace.paymentNotifications}/>
    {!workspace.hasCommitment ? <section className="variation-empty"><h2>Commercial Commitment required</h2><p>Create or select a commitment before defining its payment sequence.</p></section> : <div className="payment-flow">
      <PaymentStep number="01" title="Schedule" description="Define contract milestones, dates, percentages and conditions" badge={workspace.schedule?.status || 'NOT STARTED'} open><>{workspace.canManage ? <ScheduleEditor key={workspace.selectedCommitmentId} workspace={workspace} editor={editor} toast={toast}/> : <ReadOnlySchedule workspace={workspace}/>}</></PaymentStep>
      <PaymentStep number="02" title="Retention" description="Set retention terms and record release"><RetentionPanel workspace={workspace} editor={editor} toast={toast}/></PaymentStep>
      <PaymentStep number="03" title="Certification" description="Freeze evidence and record the PM decision" badge={`${workspace.paymentCertifications?.cases?.length || 0} cases`}><CertificationEvidence workspace={workspace} editor={editor} toast={toast}/></PaymentStep>
      <PaymentStep number="04" title="Payment tracking" description="Record external sent and received events"><PaymentTracking workspace={workspace} editor={editor} toast={toast}/></PaymentStep>
    </div>}
  </main>;
}
