import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjectPaymentSchedule } from '../hooks/useProjectPaymentSchedule.js';
import { usePaymentSchedulePresentation } from '../hooks/usePaymentSchedulePresentation.js';
import { useToast } from '../components/shared/Toast.jsx';
import PaymentNotifications from '../components/payments/PaymentNotifications.jsx';
import CertificationEvidence from '../components/payments/CertificationEvidence.jsx';
import PaymentTracking from '../components/payments/PaymentTracking.jsx';
import RetentionPanel from '../components/payments/RetentionPanel.jsx';

const blank = () => ({ milestoneId: crypto.randomUUID(), title: '', plannedDate: '', percentage: '', condition: '' });
const money = (value, currency) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;

function Editor({ workspace, editor, toast }) {
  const existing = workspace.schedule;
  const [scheduleId, setScheduleId] = useState(existing?.status === 'DRAFT' ? existing.paymentScheduleId : crypto.randomUUID());
  const [mode, setMode] = useState(existing?.mode || 'MILESTONE');
  const [rows, setRows] = useState(existing?.milestones?.length ? existing.milestones.map(item => ({ ...item })) : [blank()]);
  const presentation = usePaymentSchedulePresentation(rows, workspace.award);
  const update = (index, key, value) => setRows(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const save = async () => { try { await editor.save(scheduleId, mode, rows); toast.success('Payment schedule draft saved.'); } catch (error) { toast.error(error.message); } };
  const activate = async () => { try { await editor.activate(scheduleId); toast.success('Payment schedule activated.'); } catch (error) { toast.error(error.message); } };
  const startVersion = () => { setScheduleId(crypto.randomUUID()); setRows(existing.milestones.map(item => ({ ...item, milestoneId: crypto.randomUUID() }))); };
  return <>
    <div className="variation-grid"><label>Certification mode<select value={mode} onChange={event => setMode(event.target.value)}><option value="MILESTONE">Simple / milestone-based</option><option value="MEASURED_BOQ">Measured / BOQ quantity-based</option></select></label><div><span>Scheduled</span><strong>{presentation.scheduledPercentage}% · {money(presentation.scheduledAmount, workspace.award?.currencyCode)}</strong></div></div>
    {rows.map((row, index) => <article className="variation-card" key={row.milestoneId}><div className="variation-grid"><label>Milestone<input value={row.title} onChange={event => update(index, 'title', event.target.value)}/></label><label>Planned date<input type="date" value={row.plannedDate} onChange={event => update(index, 'plannedDate', event.target.value)}/></label><label>Percentage<input type="number" min="0.0001" max="100" value={row.percentage} onChange={event => update(index, 'percentage', event.target.value)}/></label><label>Planned amount<input readOnly value={money(presentation.amountForPercentage(row.percentage), workspace.award?.currencyCode)}/></label></div><label>Payment condition<textarea rows="2" value={row.condition} onChange={event => update(index, 'condition', event.target.value)}/></label><button className="btn btn-danger" onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></article>)}
    <div><button className="btn" onClick={() => setRows([...rows, blank()])}>Add milestone</button><button className="btn btn-primary" disabled={editor.busy || presentation.scheduledPercentage > 100 || !rows.length} onClick={save}>Save draft</button>{existing?.status === 'DRAFT' && existing.paymentScheduleId === scheduleId && <button className="btn btn-success" disabled={editor.busy} onClick={activate}>Activate schedule</button>}</div>
    {existing?.status === 'ACTIVE' && <button className="btn" onClick={startVersion}>Start new version</button>}
  </>;
}

export default function ProjectPayments() {
  const { projectId } = useParams(); const editor = useProjectPaymentSchedule(projectId); const toast = useToast();
  if (editor.status === 'loading') return <main className="variation-page">Loading payment schedule…</main>;
  if (editor.status === 'error') return <main className="variation-page"><h2>Payment schedule could not be loaded</h2><p>{editor.error?.message}</p><button className="btn" onClick={editor.retry}>Retry</button></main>;
  const workspace = editor.workspace;
  const readOnlySchedule = <section className="variation-workspace"><h2>{workspace.schedule?.status || 'No schedule'}</h2>{workspace.schedule?.milestones?.map(milestone => <article className="variation-card" key={milestone.milestoneId}><h3>{milestone.sequenceNumber}. {milestone.title}</h3><p>{milestone.plannedDate} · {milestone.percentage}% · {money(milestone.plannedAmount, workspace.schedule.currencyCode)}</p><strong>{milestone.status}</strong><p>{milestone.condition}</p></article>)}</section>;
  return <main className="variation-page"><header className="variation-page-header"><div><Link to="/projects">← Back</Link><h1>Payment Schedule</h1><p>Contract entitlement and certification milestones. OpenDay does not transfer money.</p></div>{workspace.award && <strong>{money(workspace.award.contractValue, workspace.award.currencyCode)}</strong>}</header><PaymentNotifications model={workspace.paymentNotifications}/>{!workspace.hasAward ? <section className="variation-empty"><h2>Awarded contract required</h2></section> : <>{workspace.canManage ? <Editor workspace={workspace} editor={editor} toast={toast}/> : readOnlySchedule}<RetentionPanel workspace={workspace} editor={editor} toast={toast}/><CertificationEvidence workspace={workspace} editor={editor} toast={toast}/><PaymentTracking workspace={workspace} editor={editor} toast={toast}/></>}</main>;
}
