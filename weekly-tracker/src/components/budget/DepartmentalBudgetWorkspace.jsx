import { useRef, useState } from 'react';
import '../../styles/budgetHierarchy.css';
import '../../styles/budgetManagement.css';
import {
  countIncludedBudgetContributions,
  getBudgetRoundBlockers,
  groupBudgetDepartments,
  validateBudgetContribution,
  validateBudgetCycleDraft,
  validateBudgetReview,
  validateBudgetVarianceContext,
  validateNextBudgetRoundNote,
} from '../../domains/budget/departmentalBudgetModel.js';

const money = (value, currency) => new Intl.NumberFormat(undefined, {
  style: 'currency', currency, maximumFractionDigits: 2,
}).format(Number(value || 0));

export default function DepartmentalBudgetWorkspace({ editor, project, onExport, onSuccess, onError }) {
  const workspace = editor.workspace;
  if (!workspace.cycle) return <CreateCycle editor={editor} project={project} onSuccess={onSuccess} onError={onError} />;
  const departments = groupBudgetDepartments(workspace.contributions, workspace.ownerships);
  const includedCount = countIncludedBudgetContributions(workspace.contributions);
  const locked = workspace.roundControl.state === 'ISSUED';
  const approved = Boolean(workspace.approval?.baseline);
  return <div className="budget-workspace">
    {approved ? <>
      <ApprovalControl editor={editor} workspace={workspace} onSuccess={onSuccess} onError={onError} />
      <ApprovedBudgetTable workspace={workspace} />
      <BudgetExcelExchange editor={editor} locked={locked} approved onExport={onExport} onSuccess={onSuccess} onError={onError} />
    </> : <>
      <RoundControl editor={editor} workspace={workspace} onSuccess={onSuccess} onError={onError} />
      {workspace.approvalReport && <BudgetApprovalReport editor={editor} workspace={workspace} onSuccess={onSuccess} onError={onError} />}
      <ApprovalControl editor={editor} workspace={workspace} onSuccess={onSuccess} onError={onError} />
    </>}
    {workspace.unreadNotificationCount > 0 && <div className="boq-alert boq-alert-info"><strong>{workspace.unreadNotificationCount} unread Budget assignment notification(s).</strong><span>Open Budget Inbox to acknowledge them.</span></div>}
    <section className="budget-summary card">
      <div><span>{workspace.canManageOwnership ? 'Consolidated budget' : 'My assigned budget'} ({workspace.projectCurrencyCode})</span><strong>{money(workspace.summary.total, workspace.projectCurrencyCode)}</strong></div>
      <div><span>Work Groups</span><strong>{workspace.summary.workGroupCount}</strong></div>
      <div><span>Not Applicable</span><strong>{workspace.summary.workGroupCount - includedCount}</strong></div>
      <div><span>Included</span><strong>{includedCount}</strong></div>
    </section>
    {!approved && <BudgetExcelExchange editor={editor} locked={locked} onExport={onExport} onSuccess={onSuccess} onError={onError} />}
    {departments.map(department => <details className="card budget-department" key={department.departmentId}>
      <summary><div><h2>{department.departmentLabel}</h2><span>{department.disciplines.length} disciplines · {department.includedCount} included</span></div><BudgetSubmissionBadges submitted={department.submittedCount} notSubmitted={department.includedCount - department.submittedCount} /></summary>
      <div className="budget-department-body">{department.disciplines.map(group => <DisciplineBudgetSection
        key={`${group.disciplineId}-${group.contributions.map(row => row.revision).join('.')}`}
        group={group}
        locked={locked}
        busy={editor.busy === `discipline-${group.disciplineId}`}
        save={editor.saveContributions}
        submit={editor.submitContributions}
        onSuccess={onSuccess}
        onError={onError}
      />)}</div>
    </details>)}
  </div>;
}

function BudgetSubmissionBadges({ submitted, notSubmitted }) {
  return <div className="budget-submission-badges"><span className="not-submitted">Not Submitted <strong>{notSubmitted}</strong></span><span className="submitted">Submitted <strong>{submitted}</strong></span></div>;
}

function BudgetExcelExchange({ editor, locked, approved = false, onExport, onSuccess, onError }) {
  const inputRef = useRef(null);
  const state = editor.importState;
  return <section className="card budget-excel-exchange">
    <div><strong>Excel</strong><span>{approved ? 'Export the approved budget baseline. Approved values are read-only.' : 'Export the current budget, edit Amount and Note, then import it back.'}</span></div>
    <div className="budget-excel-actions"><button className="btn btn-secondary" type="button" disabled={Boolean(editor.busy)} onClick={onExport}>Export Excel</button>{!approved && <><input ref={inputRef} className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={async event => { const file = event.target.files?.[0]; if (file) await editor.previewImport(file); event.target.value = ''; }} /><button className="btn btn-secondary" type="button" disabled={locked || Boolean(editor.busy)} onClick={() => inputRef.current?.click()}>Import Excel</button></>}</div>
    {state.status !== 'idle' && <div className={`budget-excel-result ${state.plan?.ok ? 'is-valid' : 'is-invalid'}`} role="status">{state.plan?.ok ? <><div><strong>Excel import is valid</strong><span>{state.plan.summary.changedCount} changes · {state.plan.summary.includedCount} included · {state.plan.summary.notApplicableCount} not applicable</span></div><div className="budget-excel-actions"><button className="btn btn-secondary" type="button" disabled={state.status === 'committing'} onClick={editor.dismissImport}>Cancel</button><button className="btn btn-primary" type="button" disabled={state.status === 'committing' || state.plan.summary.changedCount === 0} onClick={async () => { const out = await editor.commitImport(); out.ok ? onSuccess?.(`${out.summary.changedCount} budget change(s) imported from Excel.`) : onError?.(out.error); }}>{state.status === 'committing' ? 'Importing...' : 'Apply Excel changes'}</button></div></> : <><div><strong>Excel import blocked</strong><ul>{(state.plan?.issues || []).slice(0, 8).map((item, index) => <li key={`${item.code}-${index}`}>{budgetImportIssueMessage(item)}</li>)}</ul></div><button className="btn btn-secondary" type="button" onClick={editor.dismissImport}>Close</button></>}</div>}
  </section>;
}

function budgetImportIssueMessage(item) {
  const prefix = item.rowNumber ? `Row ${item.rowNumber}: ` : '';
  const messages = {
    BUDGET_IMPORT_DIFFERENT_PROJECT: `This file belongs to project ${item.fileProjectCode}; the current project is ${item.currentProjectCode}. Export Excel from this budget page and try again.`,
    BUDGET_IMPORT_DIFFERENT_CYCLE: 'This file belongs to another Budget Cycle. Export a fresh Excel file from this budget page.',
    BUDGET_IMPORT_DIFFERENT_ROUND: `This file is for Budget Round ${item.fileRound}; the current round is ${item.currentRound}. Export the current round and try again.`,
    BUDGET_IMPORT_DIFFERENT_CURRENCY: `The file currency is ${item.fileCurrency}; the current budget currency is ${item.currentCurrency}.`,
    BUDGET_IMPORT_STALE_REVISION: 'This Work Group changed after the Excel file was exported. Export a fresh file and reapply the edit.',
    BUDGET_IMPORT_INVALID_AMOUNT: 'Amount must be zero or positive with no more than two decimal places.',
    BUDGET_IMPORT_NOTE_TOO_LONG: 'Note must contain no more than 2,000 characters.',
    BUDGET_IMPORT_WORK_GROUP_IDENTITY_MISMATCH: 'Work Group codes or labels were changed. Edit only Amount and Note.',
    BUDGET_IMPORT_REQUIRES_DRAFT_ROUND: 'Excel can be imported only while the Budget Round is in Draft.',
    BUDGET_IMPORT_REQUIRED_SHEET_MISSING: 'This is not an OpenDay Budget workbook. Export a new file from this budget page.',
    BUDGET_IMPORT_UNSUPPORTED_FORMAT: 'This Excel format is not supported. Export a new file from this budget page.',
  };
  return `${prefix}${messages[item.code] || 'The workbook structure is invalid. Export a fresh file and edit only Amount and Note.'}`;
}

function CreateCycle({ editor, project, onSuccess, onError }) {
  const [draft, setDraft] = useState({ title: `${project.storeCode || 'Project'} Budget`, currencyCode: project.currencyCode || '' });
  const issues = validateBudgetCycleDraft(draft);
  return <section className="card budget-create"><h2>Create Budget Cycle</h2><p>Start one collaborative budget workspace over the project's canonical Work Groups. Currency is inherited from the project: <strong>{project.currencyCode || 'not selected'}</strong>.</p><label>Title<input className="ds-input" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label><button className="btn btn-primary" disabled={issues.length > 0 || editor.busy === 'cycle'} onClick={async () => { const out = await editor.createCycle(draft); out.ok ? onSuccess?.('Budget Cycle created.') : onError?.(out.error); }}>{editor.busy === 'cycle' ? 'Creating...' : 'Create Budget Cycle'}</button></section>;
}

function buildContributionDraft(row) {
  return { workGroupId: row.workGroupId, amount: row.amount ?? '', note: row.note || '', status: row.status, revision: row.revision };
}

function contributionChanged(row, draft) {
  return String(draft.amount ?? '') !== String(row.amount ?? '')
    || draft.note !== (row.note || '')
    || draft.status !== row.status;
}

function DisciplineBudgetSection({ group, locked, busy, save, submit, onSuccess, onError }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(group.contributions.map(row => [row.workGroupId, buildContributionDraft(row)])));
  const updateDraft = (workGroupId, patch) => setDrafts(current => ({ ...current, [workGroupId]: { ...current[workGroupId], ...patch } }));
  const changed = group.contributions.filter(row => contributionChanged(row, drafts[row.workGroupId]));
  const invalid = changed.some(row => validateBudgetContribution(drafts[row.workGroupId]).length > 0);
  const submitInputs = group.contributions.flatMap(row => {
    const draft = drafts[row.workGroupId];
    if (String(draft.amount ?? '').trim() === '' || (draft.status === 'SUBMITTED' && !contributionChanged(row, draft))) return [];
    return [{ ...draft, status: 'SUBMITTED' }];
  });
  const submitInvalid = submitInputs.some(input => validateBudgetContribution(input).length > 0);
  const includedCount = Object.values(drafts).filter(draft => String(draft.amount ?? '').trim() !== '').length;
  return <details className="budget-discipline">
    <summary><div><span>{group.disciplineCode}</span><h3>{group.disciplineLabel}</h3><small>{includedCount} included</small></div><BudgetSubmissionBadges submitted={group.submittedCount} notSubmitted={group.notSubmittedCount} /></summary>
    <div className="budget-table" role="table" aria-label={`${group.disciplineLabel} budget`}>
      <div className="budget-table-head" role="row"><span>Work Group</span><span>Amount</span><span>Status</span><span>Note</span></div>
      {group.contributions.map(row => {
        const draft = drafts[row.workGroupId];
        return <div className="budget-contribution" role="row" key={row.workGroupId}>
          <div className="budget-work-group"><strong>{row.workGroupCode}</strong><span>{row.workGroupLabel}</span></div>
          <input aria-label={`${row.workGroupCode} amount`} className="ds-input" inputMode="decimal" disabled={locked} value={draft.amount} onChange={event => updateDraft(row.workGroupId, { amount: event.target.value, status: event.target.value === '' ? 'NOT_STARTED' : 'IN_PROGRESS' })} />
          <span aria-label={`${row.workGroupCode} status`} className={`budget-usage-status ${String(draft.amount ?? '').trim() === '' ? 'not-applicable' : 'included'}`}>{String(draft.amount ?? '').trim() === '' ? 'Not Applicable' : 'Included'}</span>
          <input aria-label={`${row.workGroupCode} note`} className="ds-input" disabled={locked} value={draft.note} onChange={event => updateDraft(row.workGroupId, { note: event.target.value })} />
        </div>;
      })}
      <footer className="budget-discipline-footer"><span>{changed.length > 0 ? `${changed.length} unsaved change(s)` : 'No unsaved changes'}</span><button className="btn btn-secondary" disabled={locked || busy || changed.length === 0 || invalid} onClick={async () => { const out = await save(group.disciplineId, changed.map(row => drafts[row.workGroupId])); out.ok ? onSuccess?.(`${group.disciplineLabel} saved.`) : onError?.(out.error); }}>{locked ? 'Locked' : busy ? 'Saving...' : 'Save section'}</button><button className="btn btn-primary" disabled={locked || busy || submitInputs.length === 0 || submitInvalid} onClick={async () => { const out = await submit(group.disciplineId, submitInputs); out.ok ? onSuccess?.(`${group.disciplineLabel}: ${submitInputs.length} work(s) submitted.`) : onError?.(out.error); }}>{locked ? 'Locked' : busy ? 'Submitting...' : 'Submit section'}</button></footer>
    </div>
  </details>;
}

function RoundControl({ editor, workspace, onSuccess, onError }) {
  const control = workspace.roundControl;
  const blockers = getBudgetRoundBlockers(control);
  const [note, setNote] = useState('');
  const noteIssues = validateNextBudgetRoundNote(note);
  return <section className="card budget-round-control">
    <header><div><span>Budget rounds</span><h2>Budget Round {control.currentRoundNumber}</h2></div><strong className={`budget-round-state ${control.state.toLowerCase()}`}>{control.state === 'DRAFT' ? 'Working draft' : 'Issued for review'}</strong></header>
    <p>{control.state === 'DRAFT' ? 'Contributions remain editable until this round is issued. Issuing creates an immutable snapshot.' : 'The issued snapshot is immutable. Start the next round to revise the working values.'}</p>
    {workspace.canManageOwnership && control.state === 'DRAFT' && <div className="budget-round-action"><button className="btn btn-primary" disabled={!control.canIssue || editor.busy === 'issue-round'} onClick={async () => { const out = await editor.issueRound(); out.ok ? onSuccess?.(`Budget Round ${control.currentRoundNumber} issued as an immutable snapshot.`) : onError?.(out.error); }}>{editor.busy === 'issue-round' ? 'Issuing...' : `Issue Budget Round ${control.currentRoundNumber}`}</button>{blockers.length > 0 && <small>{blockers.join(' / ')}</small>}</div>}
    {workspace.canManageOwnership && control.state === 'ISSUED' && workspace.approval.currentReview?.decision === 'REVISION_REQUIRED' && <div className="budget-round-action"><label>Reason / management context for next round<textarea className="ds-input" maxLength="1000" value={note} onChange={event => setNote(event.target.value)} /></label><button className="btn btn-primary" disabled={noteIssues.length > 0 || editor.busy === 'next-round'} onClick={async () => { const out = await editor.startNextRound(note); out.ok ? onSuccess?.(`Budget Round ${control.currentRoundNumber + 1} started from the previous snapshot.`) : onError?.(out.error); }}>{editor.busy === 'next-round' ? 'Starting...' : `Start Budget Round ${control.currentRoundNumber + 1}`}</button></div>}
    {workspace.rounds.length > 0 && <div className="budget-round-history"><h3>Immutable round history</h3>{workspace.rounds.map(round => <article key={round.roundId}><div><strong>{round.title}</strong><small>{new Date(round.issuedAt).toLocaleString()}</small></div><div><strong>{money(round.total, workspace.cycle.currencyCode)}</strong><small>{round.changeFromPrevious == null ? 'Initial round' : `${money(round.changeFromPrevious, workspace.cycle.currencyCode)} vs previous`}</small></div></article>)}</div>}
  </section>;
}

function ApprovalControl({ editor, workspace, onSuccess, onError }) {
  const approval = workspace.approval;
  const [comment, setComment] = useState('');
  const approvalIssues = validateBudgetReview({ decision: 'APPROVED', comment });
  const returnIssues = validateBudgetReview({ decision: 'REVISION_REQUIRED', comment });
  if (workspace.roundControl.state !== 'ISSUED') return null;
  if (approval.baseline) return <section className="card budget-approval approved budget-approved-status"><header><div><span>Current budget status</span><h2>Budget approved</h2></div><strong>APPROVED</strong></header><div className="budget-baseline-total">{money(approval.baseline.total, approval.baseline.currencyCode)}</div><p>Budget Round {approval.baseline.sourceRoundNumber} was approved {new Date(approval.baseline.approvedAt).toLocaleString()}. This immutable baseline contains {approval.baseline.workGroupCount} Work Groups.</p></section>;
  if (approval.currentReview) return <section className={`card budget-approval ${approval.currentReview.decision.toLowerCase()}`}><header><div><span>Management Review</span><h2>{approval.currentReview.decision === 'APPROVED' ? 'Approved' : 'Revision Required'}</h2></div><strong>{approval.currentReview.decision.replace('_', ' ')}</strong></header>{approval.currentReview.comment && <p>{approval.currentReview.comment}</p>}<small>Decision recorded {new Date(approval.currentReview.reviewedAt).toLocaleString()}.</small></section>;
  if (!approval.canReview) return <section className="card budget-approval pending"><header><div><span>Management Review</span><h2>Awaiting authorised reviewer</h2></div><strong>PENDING</strong></header><p>An Admin with access to this project must review the issued round.</p></section>;
  const reportBlocksApproval = !workspace.approvalReport?.approvalReady;
  const nextRound = workspace.roundControl.currentRoundNumber + 1;
  return <section className="card budget-approval pending"><header><div><span>Management Review</span><h2>Review issued Budget Round</h2></div><strong>DECISION REQUIRED</strong></header><div className="budget-review-form"><label>Management comment<textarea className="ds-input" maxLength="2000" value={comment} onChange={event => setComment(event.target.value)} placeholder="Required when returning the budget; optional when approving" /></label><div className="budget-review-actions"><button className="btn btn-primary" disabled={approvalIssues.length > 0 || reportBlocksApproval || Boolean(editor.busy)} title={reportBlocksApproval ? 'Resolve unexplained variance and open questions first' : ''} onClick={async () => { const out = await editor.reviewRound({ decision: 'APPROVED', comment }); out.ok ? onSuccess?.('Approved Budget Baseline created.') : onError?.(out.error); }}>{editor.busy === 'review-round' ? 'Recording...' : 'Budget approved'}</button><button className="btn btn-secondary" disabled={returnIssues.length > 0 || Boolean(editor.busy)} onClick={async () => { const out = await editor.returnForNextRound(comment); out.ok ? onSuccess?.(`Budget returned and Round ${nextRound} opened.`) : onError?.(out.error); }}>{editor.busy === 'return-next-round' ? 'Returning...' : `Return budget for Round ${nextRound}`}</button></div></div></section>;
}

function ApprovedBudgetTable({ workspace }) {
  const baseline = workspace.approval.baseline;
  const report = workspace.approvalReport;
  const sections = report?.sectionTotals || [];
  const projectArea = report?.projectAreaSqm == null ? 'Not set' : `${report.projectAreaSqm} m²`;
  return <section className="card budget-approved-table">
    <header><div><span>Approved Budget Baseline</span><h2>Approved budget by section</h2></div><strong>Round {baseline.sourceRoundNumber}</strong></header>
    {sections.length > 0 ? <div className="budget-management-table">
      <table aria-label="Approved budget by section">
        <caption>Project area: <strong>{projectArea}</strong></caption>
        <thead><tr><th>Section</th><th>Included works</th><th>Approved amount</th><th>Per m²</th></tr></thead>
        <tbody>{sections.map(section => <tr key={section.sectionCode}><td><strong>{section.sectionCode}</strong> {section.sectionLabel}</td><td>{section.workGroupCount}</td><td>{money(section.amount, baseline.currencyCode)}</td><td>{section.amountPerSqm == null ? '—' : money(section.amountPerSqm, baseline.currencyCode)}</td></tr>)}</tbody>
        <tfoot><tr><th>TOTAL APPROVED</th><th>{baseline.workGroupCount}</th><th>{money(baseline.total, baseline.currencyCode)}</th><th>{report.totalAmountPerSqm == null ? '—' : money(report.totalAmountPerSqm, baseline.currencyCode)}</th></tr></tfoot>
      </table>
    </div> : <p>The approved total is available above. Section-level details are unavailable for this historical baseline.</p>}
  </section>;
}

const varianceReasons=[['MARKET_PRICE_INCREASE','Market price increase'],['LABOR_COST_INCREASE','Labor cost increase'],['QUANTITY_INCREASE','Quantity increase'],['SCOPE_INCREASE','Scope increase'],['SPECIFICATION_UPGRADE','Specification upgrade'],['CURRENCY_IMPACT','Currency impact'],['LOGISTICS','Logistics'],['REGULATORY_REQUIREMENT','Regulatory requirement'],['DESIGN_CHANGE','Design change'],['PREVIOUS_BENCHMARK_NOT_COMPARABLE','Previous benchmark not comparable'],['BUDGET_METHODOLOGY_CHANGE','Budget methodology change'],['OTHER','Other']];
function BudgetApprovalReport({ editor, workspace, onSuccess, onError }) {
  const report = workspace.approvalReport;
  const projectArea = report.projectAreaSqm == null ? 'Not set' : `${Number(report.projectAreaSqm).toLocaleString()} m²`;
  return <section className="card budget-report">
    <header><div><span>Budget Approval Report</span><h2>Management view / Budget Round {report.roundNumber}</h2></div><strong className={report.approvalReady ? 'is-ready' : 'is-blocked'}>{report.approvalReady ? 'READY FOR APPROVAL' : 'CONTEXT REQUIRED'}</strong></header>
    <div className="budget-management-table">
      <table aria-label="Budget by section">
        <caption>Project area: <strong>{projectArea}</strong></caption>
        <thead><tr><th>Section</th><th>Included works</th><th>Amount</th><th>Per m²</th></tr></thead>
        <tbody>{report.sectionTotals.map(section => <tr key={section.sectionCode}><td><strong>{section.sectionCode}</strong> {section.sectionLabel}</td><td>{section.workGroupCount}</td><td>{money(section.amount, report.currencyCode)}</td><td>{section.amountPerSqm == null ? '—' : money(section.amountPerSqm, report.currencyCode)}</td></tr>)}</tbody>
        <tfoot><tr><th>TOTAL</th><th>{report.workGroupCount}</th><th>{money(report.totalProposedBudget, report.currencyCode)}</th><th>{report.totalAmountPerSqm == null ? '—' : money(report.totalAmountPerSqm, report.currencyCode)}</th></tr></tfoot>
      </table>
    </div>
    <div className="budget-round-metrics"><table aria-label="Budget round metrics"><tbody><tr><th>Net change</th><td>{report.netChange == null ? 'Initial round' : money(report.netChange, report.currencyCode)}</td><th>Total increases</th><td>{money(report.totalIncrease, report.currencyCode)}</td></tr><tr><th>Total decreases</th><td>{money(report.totalDecrease, report.currencyCode)}</td><th>Unexplained / Open questions</th><td>{report.unexplainedVarianceCount} / {report.openQuestionCount}</td></tr></tbody></table></div>
    <div className="boq-alert boq-alert-info"><strong>Comparable historical projects: unavailable</strong><span>{report.benchmarkMessage}</span></div>
    <blockquote>{report.approvalRule}</blockquote>
    {report.changes.length === 0 ? <p>No Work Group movement from a prior round. This is the initial management proposal.</p> : <div className="budget-report-changes"><h3>Major increases / decreases and context</h3>{report.changes.map(change => <VarianceContextEditor key={change.workGroupId} change={change} currency={report.currencyCode} busy={editor.busy === `variance-${change.workGroupId}`} save={editor.saveVarianceContext} onSuccess={onSuccess} onError={onError} />)}</div>}
  </section>;
}
function VarianceContextEditor({change,currency,busy,save,onSuccess,onError}){const[draft,setDraft]=useState({workGroupId:change.workGroupId,reasonCode:change.reasonCode||'',explanation:change.explanation||'',evidenceReference:change.evidenceReference||'',openQuestion:change.openQuestion||'',revision:change.contextRevision||0}),issues=validateBudgetVarianceContext(draft);return <article className="budget-variance-row"><header><div><strong>{change.workGroupCode} / {change.workGroupLabel}</strong><small>{change.disciplineLabel}</small></div><strong className={change.direction==='INCREASE'?'is-increase':'is-decrease'}>{change.direction==='INCREASE'?'+':''}{money(change.delta,currency)}</strong></header><div className="budget-variance-grid"><label>Structured reason<select className="ds-select" value={draft.reasonCode} onChange={event=>setDraft({...draft,reasonCode:event.target.value})}><option value="">Select reason</option>{varianceReasons.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Human explanation<textarea className="ds-input" maxLength="2000" value={draft.explanation} onChange={event=>setDraft({...draft,explanation:event.target.value})}/></label><label>Evidence reference<input className="ds-input" maxLength="1000" placeholder="Document, estimate, quote, RFI or URL reference" value={draft.evidenceReference} onChange={event=>setDraft({...draft,evidenceReference:event.target.value})}/></label><label>Open question (blocks approval)<input className="ds-input" maxLength="1000" value={draft.openQuestion} onChange={event=>setDraft({...draft,openQuestion:event.target.value})}/></label><button className="btn btn-secondary" disabled={busy||issues.length>0} onClick={async()=>{const out=await save(draft);out.ok?onSuccess?.(`${change.workGroupLabel} variance context saved.`):onError?.(out.error)}}>{busy?'Saving...':'Save context & evidence'}</button></div></article>}
