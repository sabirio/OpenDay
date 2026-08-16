import { useState } from 'react';

const money = (value, currency) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency || ''}`;

function TrackingControls({ payment, editor, toast }) {
  const sent = payment.caseStatus === 'SENT_FOR_PAYMENT';
  const [amount, setAmount] = useState(sent ? '' : String(payment.payableAmount));
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const submit = async () => { try { await editor.recordPayment(payment.certificationCaseId, sent ? 'PAYMENT_RECEIVED' : 'SENT_FOR_PAYMENT', amount, reference, date, note); toast.success(sent ? 'Payment receipt recorded.' : 'Sent-for-payment event recorded.'); } catch (error) { toast.error(error.message); } };
  return <div className="variation-grid"><label>{sent ? 'Received amount' : 'Submitted amount'}<input type="number" min="0.01" max={sent ? payment.outstandingAmount : payment.payableAmount} value={amount} onChange={event => setAmount(event.target.value)}/></label><label>External reference<input value={reference} maxLength="500" onChange={event => setReference(event.target.value)}/></label><label>Event date<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label><label>Note<textarea rows="2" maxLength="3000" value={note} onChange={event => setNote(event.target.value)}/></label><button className="btn btn-primary" disabled={editor.busy || !amount || !reference.trim() || !date} onClick={submit}>{sent ? 'Record payment received' : 'Record sent for payment'}</button></div>;
}

export default function PaymentTracking({ workspace, editor, toast }) {
  return <section className="variation-workspace"><h2>Payment tracking</h2><p>External payment status only. OpenDay does not move funds.</p>{(workspace.paymentTracking?.payments || []).map(payment => <article className="variation-card" key={payment.certificationCaseId}><h3>Case #{payment.caseNumber}: {payment.milestoneTitle}</h3><strong>{payment.caseStatus}</strong><p>Certified {money(payment.certifiedAmount, payment.currencyCode)} · retention {money(payment.retentionAmount, payment.currencyCode)} · payable {money(payment.payableAmount, payment.currencyCode)} · paid {money(payment.paidAmount, payment.currencyCode)} · outstanding {money(payment.outstandingAmount, payment.currencyCode)}</p>{payment.events.map(event => <p key={event.eventId}>{event.eventDate} · {event.eventType} · {money(event.amount, payment.currencyCode)} · {event.externalReference}</p>)}{workspace.canManage && ['APPROVED','PARTIALLY_APPROVED','SENT_FOR_PAYMENT'].includes(payment.caseStatus) && <TrackingControls payment={payment} editor={editor} toast={toast}/>}</article>)}</section>;
}
