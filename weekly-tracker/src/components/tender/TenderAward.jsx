import { useTenderAwardPresentation } from '../../hooks/useTenderPresentation.js';

export default function TenderAward({ workspace, editor, onAwarded, onScopeMaterialized, onError }) {
  const model = useTenderAwardPresentation(workspace);
  const view = model.view;
  if (!view) return null;
  if (view.awarded) return <AwardSnapshot award={view.award} editor={editor} onScopeMaterialized={onScopeMaterialized} onError={onError}/>;
  const submit = async () => {
    if (!view.selectedCandidate || !window.confirm(view.confirmMessage)) return;
    const outcome = await editor.award(view.selectedCandidate.submissionId, model.note);
    if (outcome.ok) onAwarded?.(outcome.result); else onError?.(outcome.error);
  };
  return <section className="card tender-section tender-award">
    <div className="tender-section-heading"><div><h2>Award</h2><p>Select one eligible final submission. OpenDay does not choose the contractor automatically.</p></div><span className="tender-status">{view.roundLabel}</span></div>
    <div className="tender-award-candidates">{view.candidates.map(candidate => <label key={candidate.participantId} className={candidate.selected ? 'is-selected' : ''}><input type="radio" name="award-candidate" value={candidate.submissionId || ''} checked={candidate.selected} disabled={!candidate.eligible} onChange={() => model.setSelectedSubmissionId(candidate.submissionId)}/><span><strong>{candidate.biddingOrganizationName||candidate.contractorName}</strong><small>{candidate.totalDisplay}</small></span><span className={`tender-access-status ${candidate.eligibilityTone}`}>{candidate.eligibilityLabel}</span></label>)}</div>
    <label className="tender-award-note">Award decision note<textarea className="ds-input" value={model.note} maxLength="4000" placeholder="Record the commercial decision rationale and approval context" onChange={event => model.setNote(event.target.value)}/></label>
    {!view.eligibleCount && <div className="boq-alert boq-alert-danger">No eligible submission. Complete pricing, PM review and clarifications first.</div>}
    <div className="tender-award-actions"><span>{view.readyMessage}</span><button className="btn btn-primary" disabled={editor.awarding || !view.canSubmit} onClick={submit}>{editor.awarding ? 'Awarding…' : 'Award tender'}</button></div>
  </section>;
}

function AwardSnapshot({ award, editor, onScopeMaterialized, onError }) {
  const scope = award.executionScope;
  const materialize = async () => {
    if (!window.confirm(award.materializeConfirmMessage)) return;
    const outcome = await editor.materializeAwardedScope(award.awardId, scope.expectedLatestScopeRevision);
    if (outcome.ok) onScopeMaterialized?.(outcome.result); else onError?.(outcome.error);
  };
  return <section className="card tender-section tender-award is-awarded">
    <div className="tender-section-heading"><div><h2>Awarded Contract</h2><p>Immutable commercial baseline created {award.awardedAtDisplay}.</p></div><span className="tender-access-status is-active">AWARDED</span></div>
    <div className="tender-review-summary"><div><span>Awarded organization</span><strong>{award.biddingOrganizationName||award.contractorName}</strong></div><div><span>Contract value</span><strong>{award.contractValueDisplay}</strong></div><div><span>BOQ lines</span><strong>{award.lineCount}</strong></div><div><span>Work Groups</span><strong>{award.workGroupCount}</strong></div><div><span>Source</span><strong>Final submission</strong></div></div>
    <div className="bid-submitted-banner"><strong>Commercial Baseline frozen.</strong> {award.baselineMessage}</div>
    <div className="tender-awarded-groups">{award.costPackages.map(item => <div key={item.costPackageId}><span><strong>{item.costPackageCode} · {item.costPackageName}</strong><small>{item.workGroupCount} Work Group(s)</small></span><strong>{item.baselineValueDisplay}</strong></div>)}</div>
    <p className="tender-award-decision"><strong>Decision note:</strong> {award.awardNote}</p>
    <div className="tender-awarded-groups">{award.workGroups.map(group => <div key={group.workGroupId}><span><strong>{group.workGroupCode} · {group.workGroupLabel}</strong><small>{group.lineCount} BOQ line(s)</small></span><strong>{group.awardedTotalDisplay}</strong></div>)}</div>
    {scope?.materialized ? <div className="bid-submitted-banner"><strong>Execution Scope R{scope.revisionNumber} ready to schedule.</strong> {scope.boqLineCount} awarded BOQ lines collapsed into {scope.workGroupCount} canonical Work Groups. Contractor Schedule Setup may now group or split activities.</div> : <div className="tender-award-actions"><span>Generate ready-to-schedule Scope from awarded Work Groups. No Gantt activities or dates will be created.</span><button className="btn btn-primary" disabled={!scope || editor.materializingAwardedScope} onClick={materialize}>{editor.materializingAwardedScope ? 'Creating Scope…' : 'Create Execution Scope'}</button></div>}
  </section>;
}
