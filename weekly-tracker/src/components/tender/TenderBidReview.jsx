import { useTenderBidReviewPresentation } from '../../hooks/useTenderPresentation.js';
import TenderClarificationRegister from './TenderClarificationRegister.jsx';

export default function TenderBidReview({ workspace, clarificationWorkspace, editor, onReviewed, onClarification, onError }) {
  const model = useTenderBidReviewPresentation(workspace);
  const view = model.view;
  if (!view) return null;
  const setStatus = async action => {
    const submission = view.selected?.submission;
    if (!submission) return;
    const outcome = await editor.setReviewStatus(submission.submissionId, action, submission.reviewRevision);
    if (outcome.ok) onReviewed?.(outcome.result); else onError?.(outcome.error);
  };
  return <section className="card tender-section tender-bid-review"><div className="tender-section-heading"><div><h2>PM bid review</h2><p>Inspect each immutable submission before opening the next round.</p></div><label>Bid round<select className="ds-select" value={view.roundId} onChange={event => { model.setRoundId(event.target.value); model.setSubmissionId(''); }}>{view.roundOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
    <div className="tender-review-summary">{view.summary.map(item => <div key={item[0]}><span>{item[0]}</span><strong>{item[1]}</strong></div>)}</div>
    <div className="tender-review-layout"><aside className="tender-review-participants">{view.participants.map(participant => <button type="button" key={participant.participantId} disabled={participant.disabled} className={participant.selected ? 'is-selected' : ''} onClick={() => model.setSubmissionId(participant.submission.submissionId)}><span><strong>{participant.contractorName}</strong><small>{participant.totalDisplay}</small></span><span className={`tender-access-status ${participant.reviewTone}`}>{participant.reviewLabel}</span></button>)}</aside>
      <div className="tender-review-detail">{!view.selected ? <div className="boq-state">No submitted bid is available for review.</div> : <><div className="tender-review-heading"><div><h3>{view.selected.contractorName}</h3><p>Submitted {view.selected.submittedAtDisplay} · {view.selected.pricedDisplay}</p></div><div className="tender-review-actions">{view.selected.reviewActions.map(action => <button key={action.id} className={action.className} type="button" disabled={editor.reviewingSubmission === view.selected.submission.submissionId} onClick={() => setStatus(action.id)}>{action.label}</button>)}</div></div>
        <div className="bidder-boq-table-wrap"><table className="bidder-boq-table tender-review-table"><thead><tr><th>Work Group / BOQ Item</th><th>Qty</th><th>Unit</th><th>Unit Rate</th><th>Total</th><th>Previous Rate</th><th>Change</th><th>Bidder note</th></tr></thead><tbody>{view.selected.groups.map(group => <FragmentGroup key={group.workGroupId} group={group}/>)}</tbody></table></div><TenderClarificationRegister submission={view.selected.submission} workspace={clarificationWorkspace} editor={editor} onAction={onClarification} onError={onError}/></>}</div>
    </div></section>;
}

function FragmentGroup({ group }) {
  return <><tr className="tender-review-group"><td colSpan="8">{group.disciplineLabel} · {group.workGroupCode} · {group.workGroupLabel}</td></tr>{group.items.map(item => <tr key={item.lineId} className={item.rowTone}><td>{item.description}</td><td>{item.quantityDisplay}</td><td>{item.unit}</td><td>{item.unitRateDisplay}</td><td>{item.totalDisplay}</td><td>{item.previousRateDisplay}</td><td><span className={`bid-rate-change ${item.changeTone}`}>{item.changeDisplay}</span></td><td>{item.bidderNote || '—'}</td></tr>)}</>;
}
