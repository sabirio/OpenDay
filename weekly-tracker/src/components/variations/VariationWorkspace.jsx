import { useState } from 'react';
import { useCommercialReviewView, useVariationExposurePresentation, useVariationWorkspacePresentation } from '../../hooks/useVariationWorkspacePresentation.js';

function ReviewControls({ item, model, editor, onError }) {
  const [form, setForm] = useState({ amount: item.proposedAmount ?? '', comment: '', reason: '' });
  const act = async action => {
    const outcome = await model.transition(item, action.id, form);
    if (!outcome.ok) onError(outcome.error);
  };
  if (!item.reviewMode) return null;
  return <div className="variation-review">
    {item.reviewMode === 'UNDER_REVIEW' && <>
      <label>Approved amount<input type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })}/></label>
      <label>Decision comment<textarea rows="2" value={form.comment} onChange={event => setForm({ ...form, comment: event.target.value })}/></label>
      <label>Rejection reason<select value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })}><option value="">Select reason</option>{model.view.rejectionReasonOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </>}
    {item.reviewActions.map(action => <button key={action.id} className={action.className} disabled={editor.busy || (action.requiresComment && !form.comment.trim()) || (action.requiresReason && !form.reason)} onClick={() => act(action)}>{action.label}</button>)}
  </div>;
}

function Evidence({ item, editor, onError }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const upload = async () => {
    try {
      await editor.upload(item.variationId, file, note);
      setFile(null);
      setNote('');
    } catch (error) { onError(error); }
  };
  return <div className="variation-evidence">
    <strong>Supporting documents / photos</strong>
    {item.evidence?.length ? <ul>{item.evidence.map(evidence => <li key={evidence.evidenceId}><button className="link-button" onClick={() => editor.openEvidence(evidence.storagePath)}>{evidence.filename}</button>{evidence.note && <span> — {evidence.note}</span>}</li>)}</ul> : <p>No evidence attached.</p>}
    {item.evidenceEditable && <div className="variation-upload"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => setFile(event.target.files?.[0] || null)}/><input value={note} onChange={event => setNote(event.target.value)} placeholder="Evidence note"/><button className="btn" disabled={!file || editor.busy} onClick={upload}>Attach</button></div>}
  </div>;
}

function VariationItemDetails({ item, model, editor, onError }) {
  const submit = async () => {
    const outcome = await model.transition(item, 'SUBMIT', {});
    if (!outcome.ok) onError(outcome.error);
  };
  return <details className="variation-item-details">
    <summary>{item.numberDisplay} · {item.title} · details and actions</summary>
    <dl>
      <div><dt>Reason</dt><dd>{item.reasonLabel}</dd></div>
      <div><dt>Date identified</dt><dd>{item.dateIdentified}</dd></div>
      <div><dt>Instruction</dt><dd>{item.instructionDisplay}</dd></div>
      <div><dt>Schedule impact</dt><dd>{item.scheduleDisplay}</dd></div>
    </dl>
    {item.reviewComment && <div className="variation-decision"><strong>Review:</strong> {item.reviewComment}</div>}
    <Evidence item={item} editor={editor} onError={onError}/>
    <div className="variation-actions">
      {item.canEdit && <button className="btn" onClick={() => model.edit(item)}>Edit</button>}
      {item.canSubmit && <button className="btn btn-primary" onClick={submit}>Submit</button>}
      <ReviewControls item={item} model={model} editor={editor} onError={onError}/>
    </div>
  </details>;
}

function VariationGroup({ group, model, editor, onError }) {
  return <article className="variation-work-group">
    <header>
      <div><span>{group.code}</span><h2>{group.label}</h2><small>{group.items.length} additional work{group.items.length === 1 ? '' : 's'}</small></div>
      <div className="variation-group-totals"><span>Proposed <strong>{group.proposedDisplay}</strong></span><span>Approved <strong>{group.approvedDisplay}</strong></span></div>
    </header>
    <div className="variation-table-wrap">
      <table className="variation-table">
        <thead><tr><th>Work</th><th>Explanation</th><th>Proposed</th><th>Approved Variation</th><th>Status</th></tr></thead>
        <tbody>{group.items.map(item => <tr key={item.variationId}><td><strong>{item.numberDisplay}</strong><span>{item.title}</span></td><td>{item.description}</td><td>{item.proposedDisplay}</td><td>{item.approvedDisplay}</td><td><strong data-status={item.status}>{item.statusLabel}</strong></td></tr>)}</tbody>
      </table>
    </div>
    <div className="variation-item-action-list">{group.items.map(item => <VariationItemDetails key={item.variationId} item={item} model={model} editor={editor} onError={onError}/>)}</div>
  </article>;
}

function VariationForm({ model, editor, onSuccess, onError }) {
  const { draft, errors, view } = model;
  if (!draft) return null;
  const save = async event => {
    event.preventDefault();
    const outcome = await model.save();
    if (outcome.ok) onSuccess('Variation draft saved.');
    else if (outcome.error) onError(outcome.error);
  };
  return <form className="variation-form" onSubmit={save}>
    <h2>{view.formTitle}</h2>
    <label>Title<input value={draft.title} onChange={event => model.patch({ title: event.target.value })}/>{errors.title && <small>{errors.title}</small>}</label>
    <div className="variation-grid"><label>Discipline<select value={draft.disciplineId} onChange={event => model.patch({ disciplineId: event.target.value, workGroupId: '' })}><option value="">Select discipline</option>{view.disciplines.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Work Group<select value={draft.workGroupId} onChange={event => model.patch({ workGroupId: event.target.value })}><option value="">Select Work Group</option>{view.workGroups.map(option => <option key={option.workGroupId} value={option.workGroupId}>{option.workGroupLabel}</option>)}</select></label></div>
    {errors.scope && <small>{errors.scope}</small>}
    <div className="variation-grid"><label>Proposed Additional Cost<input type="number" min="0" step="0.01" value={draft.proposedAmount} onChange={event => model.patch({ proposedAmount: event.target.value })}/>{errors.proposedAmount && <small>{errors.proposedAmount}</small>}</label><label>Date identified<input type="date" value={draft.dateIdentified} onChange={event => model.patch({ dateIdentified: event.target.value })}/></label></div>
    <label>Reason<select value={draft.reasonCode} onChange={event => model.patch({ reasonCode: event.target.value })}><option value="">Select reason</option>{view.reasonOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label>Full description<textarea rows="5" value={draft.description} onChange={event => model.patch({ description: event.target.value })}/>{errors.description && <small>{errors.description}</small>}</label>
    <label>Drawing / RFI / instruction reference<input value={draft.instructionReference} onChange={event => model.patch({ instructionReference: event.target.value })}/></label>
    <div className="variation-grid"><label>Schedule impact (days)<input type="number" min="0" value={draft.scheduleImpactDays} onChange={event => model.patch({ scheduleImpactDays: event.target.value })}/></label><label>Related activity<select value={draft.relatedActivityId || ''} onChange={event => model.patch({ relatedActivityId: event.target.value || null })}><option value="">None</option>{editor.workspace.activities.map(activity => <option key={activity.activityId} value={activity.activityId}>{activity.activityLabel}</option>)}</select></label></div>
    <label>Schedule impact explanation<textarea rows="2" value={draft.scheduleImpactNote} onChange={event => model.patch({ scheduleImpactNote: event.target.value })}/></label>
    <div className="variation-form-actions"><button className="btn btn-primary" disabled={editor.busy}>Save draft</button><button type="button" className="btn" onClick={model.cancel}>Cancel</button></div>
  </form>;
}

export function VariationExposure({ exposure }) {
  const view = useVariationExposurePresentation(exposure);
  if (!view) return null;
  return <section className="variation-exposure"><header><div><span>Commercial commitment</span><h2>Approved vs Pending Exposure</h2></div><strong>{view.statusLabel}</strong></header>{!view.hasAward && <p className="variation-exposure-alert">An awarded contract is required before committed cost can be established.</p>}{view.currencyAlert && <p className="variation-exposure-alert">{view.currencyAlert}</p>}<div className="variation-exposure-flow"><div><span>Awarded contract</span><strong>{view.awardedDisplay}</strong></div><b>+</b><div><span>Approved variations</span><strong>{view.approvedDisplay}</strong></div><b>=</b><div data-kind="committed"><span>Current committed cost</span><strong>{view.committedDisplay}</strong></div><b>+</b><div data-kind="pending"><span>Pending exposure</span><strong>{view.pendingDisplay}</strong></div><b>=</b><div data-kind="potential"><span>Potential committed cost</span><strong>{view.potentialDisplay}</strong></div></div><p className="variation-exposure-rule">{view.rule}</p>{view.breakdownRows.length > 0 && <details><summary>Exposure by Work Group ({view.breakdownRows.length})</summary><div className="variation-exposure-breakdown">{view.breakdownRows.map(row => <div key={row.workGroupId}><span>{row.workGroupCode} · {row.workGroupLabel}</span><strong>{row.valueDisplay}</strong></div>)}</div></details>}</section>;
}

export function CommercialReview({ review, editor, currency, onError, onSuccess }) {
  const [note, setNote] = useState('');
  const view = useCommercialReviewView(review, currency);
  if (!view) return null;
  const open = async () => { try { await editor.openReview(); onSuccess('Biweekly commercial review opened.'); } catch (error) { onError(error); } };
  const close = async () => { try { await editor.closeReview(view.cycle.reviewCycleId, note); setNote(''); onSuccess('Commercial review closed.'); } catch (error) { onError(error); } };
  return <section className="commercial-review"><header><div><span>14-day cadence</span><h2>Biweekly Commercial Review</h2></div><strong>{view.headerStatus}</strong></header>{!view.cycle ? <><p>Review new requests, pending exposure, approved, rejected and disputed variations every two weeks.</p><button className="btn btn-primary" onClick={open} disabled={editor.busy}>Open review cycle</button></> : <><div className="variation-summary">{view.summary.map(item => <div key={item[0]}><span>{item[0]}</span><strong>{item[1]}</strong></div>)}</div><div className="commercial-review-buckets">{view.buckets.map(bucket => <div key={bucket.label}><strong>{bucket.count}</strong><span>{bucket.label}</span></div>)}</div><label>Closing review note<textarea rows="3" value={note} onChange={event => setNote(event.target.value)} placeholder="Decisions, unresolved items and agreed next actions"/></label><button className="btn" disabled={!note.trim() || editor.busy} onClick={close}>Close review cycle</button></>}</section>;
}

export default function VariationWorkspace({ editor, onSuccess = () => {}, onError = () => {} }) {
  const model = useVariationWorkspacePresentation(editor);
  return <section className="variation-workspace additional-works-workspace">
    <div className="variation-summary">{model.view.summary.map(item => <div key={item[0]}><span>{item[0]}</span><strong>{item[1]}</strong></div>)}</div>
    <div className="variation-workspace-toolbar"><div><h2>Works register</h2><p>Amounts are totalled by Work Group. Open a row only when evidence or a decision is needed.</p></div>{model.view.canCreate && <button className="btn btn-primary" onClick={model.start}>Create Additional Work</button>}</div>
    <VariationForm model={model} editor={editor} onSuccess={onSuccess} onError={onError}/>
    {!model.view.hasVariations ? <div className="variation-empty"><h2>No Additional Works yet</h2><p>Contractors can submit a request whenever a change is identified.</p></div> : <div className="variation-list">{model.view.variationGroups.map(group => <VariationGroup key={group.id} group={group} model={model} editor={editor} onError={onError}/>)}</div>}
  </section>;
}
