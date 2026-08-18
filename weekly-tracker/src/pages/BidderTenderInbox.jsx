import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useBidderBidRound, useBidderTenderInbox, useBidderTenderPortalAccess, useBidderTenderWorkspace } from '../hooks/useBidderTenderInbox.js';
import BidderClarifications from '../components/tender/BidderClarifications.jsx';
import '../styles/boqCompact.css';

function BidderWorkGroup({ group, round, submitted, showConsultantQuantity }) {
  return <details className="boq-work-group card">
    <summary><span><strong>{group.code}</strong>{group.label}</span><small>{group.lineCount} lines</small></summary>
    <div className="boq-group-table-wrap"><table className="bidder-boq-table boq-table-compact">
      <thead><tr><th>Item</th><th>Unit</th><th>Status</th><th>Qty by Contractor</th>{showConsultantQuantity ? <th>Qty by Consultant</th> : null}{showConsultantQuantity ? <th>Variance</th> : null}<th>Labour</th><th>Material</th><th>Total</th><th>Note</th><th></th></tr></thead>
      <tbody>{group.items.map(item => <tr key={item.lineId} className={item.isExcluded ? 'is-excluded' : item.isContractorAdded ? 'is-contractor-added' : ''}>
        <td>{item.isContractorAdded ? <input className="ds-input" aria-label="Contractor added item description" disabled={submitted || item.isExcluded} value={item.description} placeholder="Description" onChange={event => round.patchItem(item.lineId, { description: event.target.value })} /> : item.description}</td>
        <td>{item.isContractorAdded ? <input className="ds-input bid-unit-input" aria-label={`Unit for ${item.description || 'contractor added line'}`} disabled={submitted || item.isExcluded} value={item.unit} placeholder="Unit" onChange={event => round.patchItem(item.lineId, { unit: event.target.value })} /> : item.unit}</td>
        <td><span className={`bid-line-status ${item.isExcluded ? 'is-excluded' : item.isContractorAdded ? 'is-added' : ''}`}>{item.lineStatusLabel}</span></td>
        <td><input className="ds-input bid-quantity-input" aria-label={`Contractor Quantity for ${item.description}`} inputMode="decimal" disabled={submitted || item.isExcluded} value={item.contractorQuantity} placeholder="—" onChange={event => round.patchDecimal(item.lineId, 'contractorQuantity', event.target.value)} /></td>
        {showConsultantQuantity ? <td><input className="ds-input bid-quantity-input is-readonly" aria-label={`Consultant Quantity for ${item.description}`} value={item.consultantQuantity ?? ''} placeholder="—" disabled readOnly /></td> : null}
        {showConsultantQuantity ? <td className={`boq-variance ${item.quantityVarianceTone}`}>{item.quantityVarianceDisplay ?? '—'}</td> : null}
        <td><input className="ds-input bid-rate-input" aria-label={`Labour for ${item.description}`} inputMode="decimal" disabled={submitted || item.isExcluded} value={item.labourRate} placeholder="—" onChange={event => round.patchDecimal(item.lineId, 'labourRate', event.target.value)} /><span className={`bid-rate-change ${item.labourChanged ? 'is-changed' : ''}`}>{item.previousLabourDisplay}</span></td>
        <td><input className="ds-input bid-rate-input" aria-label={`Material for ${item.description}`} inputMode="decimal" disabled={submitted || item.isExcluded} value={item.materialRate} placeholder="—" onChange={event => round.patchDecimal(item.lineId, 'materialRate', event.target.value)} /><span className={`bid-rate-change ${item.materialChanged ? 'is-changed' : ''}`}>{item.previousMaterialDisplay}</span></td>
        <td>{item.totalDisplay ?? '—'}</td>
        <td><input className="ds-input boq-note" disabled={submitted} value={item.bidderNote} placeholder="Optional" onChange={event => round.patchItem(item.lineId, { bidderNote: event.target.value })} /></td>
        <td>{!submitted ? <button type="button" className="btn btn-ghost bid-line-action" onClick={() => round.setLineIncluded(item.lineId, item.isExcluded)}>{item.isExcluded ? 'Include' : 'Exclude'}</button> : null}</td>
      </tr>)}</tbody>
    </table></div>
    {!submitted ? <div className="bid-work-group-actions"><button type="button" className="btn btn-secondary" onClick={() => round.addLine(group.id)}>+ Add contractor line</button></div> : null}
  </details>;
}

function BidRoundEditor({ tenderId, groups }) {
  const round = useBidderBidRound(tenderId, groups);
  const [message, setMessage] = useState(null);
  if (round.status === 'loading') return <div role="status">Loading active bid round...</div>;
  if (round.status === 'error') return <div className="boq-alert boq-alert-danger">The active bid round could not be loaded.</div>;
  if (!round.draft) return <div className="bidder-readonly-note"><strong>No bid round is currently open.</strong> The issued package remains available for review.</div>;
  const draft = round.draft;
  const view = round.presentation;
  return <section className="bid-round-editor">
    <div className="card bid-round-toolbar"><div><h2>{view.roundTitle}</h2><p>{view.roundDetail}</p></div><div className="bid-round-summary"><span>Priced<strong>{view.summary.pricedLineCount}/{view.summary.lineCount}</strong></span><span>Added<strong>{view.summary.addedLineCount}</strong></span><span>Excluded<strong>{view.summary.excludedLineCount}</strong></span><span>Changed<strong>{view.summary.changedLineCount}</strong></span><span>Total<strong>{view.summary.totalDisplay} {draft.currencyCode}</strong></span></div></div>
    {view.isSubmitted ? <div className="bid-submitted-banner"><strong>Bid submitted.</strong> This round is now an immutable snapshot and can no longer be edited.</div> : null}
    {message ? <div className={`boq-alert ${message.ok ? 'boq-alert-info' : 'boq-alert-danger'}`}>{message.text}</div> : null}
    <section className="boq-standard-schedule bidder-standard-schedule"><header><div><h2>BOQ</h2><p>Open a Work Group to enter quantities, rates, exclusions and contractor-added lines.</p></div><span>{view.workGroupCount} Work Groups · {view.lineCount} lines</span></header>{view.workGroups.map(group => <BidderWorkGroup key={group.id} group={group} round={round} submitted={view.isSubmitted} showConsultantQuantity={view.showConsultantQuantity} />)}</section>
    {!view.isSubmitted ? <div className="bid-round-actions"><button className="btn btn-secondary" disabled={round.saving || !view.canSave} onClick={async () => { const outcome = await round.save(); setMessage(outcome.ok ? { ok: true, text: `Draft revision ${outcome.result.draftRevision} saved.` } : { ok: false, text: 'Draft could not be saved.' }); }}>{round.saving ? 'Saving...' : 'Save draft'}</button><button className="btn btn-primary" disabled={round.submitting || !view.canSubmit} onClick={async () => { if (!window.confirm('Submit this bid as an immutable snapshot? It cannot be edited after submission.')) return; const outcome = await round.submit(); setMessage(outcome.ok ? { ok: true, text: `Bid Round ${outcome.result.roundNumber} submitted.` } : { ok: false, text: 'Bid could not be submitted.' }); }}>{round.submitting ? 'Submitting...' : 'Submit bid'}</button></div> : null}
  </section>;
}

function TenderWorkspace({ summary, onBack }) {
  const { status, data } = useBidderTenderWorkspace(summary.tenderId);
  if (status === 'loading') return <main className="bidder-tender-main" role="status">Loading issued tender...</main>;
  if (status === 'error') return <main className="bidder-tender-main"><button className="btn btn-ghost" onClick={onBack}>← Tender invitations</button><div className="boq-alert boq-alert-danger">This tender could not be loaded or your invitation is not accepted.</div></main>;
  return <main className="bidder-tender-main"><button className="btn btn-ghost" onClick={onBack}>← Tender invitations</button><h1>{data.title}</h1><p>{data.projectStoreCode} · {data.locationLabel} · {data.tenderNumber}</p><section className="bidder-workspace-summary"><div className="card"><span>Deadline</span><strong>{data.deadlineDisplay}</strong></div><div className="card"><span>Currency</span><strong>{data.currencyCode}</strong></div><div className="card"><span>Tender setup</span><strong>{data.setupRevisionLabel}</strong></div><div className="card"><span>Issued BOQ</span><strong>{data.boqRevisionLabel}</strong></div></section><section className="card bidder-rules"><h2>Tender rules</h2><p>{data.tenderRules}</p></section><BidderClarifications tenderId={data.tenderId} /><BidRoundEditor tenderId={data.tenderId} groups={data.workGroups} /></main>;
}

function InvitationCard({ item, busy, onRespond, onOpen }) {
  return <article className="card bidder-tender-card"><div><span>{item.projectStoreCode} · {item.tenderNumber}</span><h2>{item.title}</h2><p>{item.locationLabel} · {item.setupRevisionLabel}</p><p>{item.invitationMessage}</p></div><div><small>Deadline</small><strong>{item.deadlineDisplay}</strong><span className={`tender-access-status ${item.invitationTone}`}>{item.statusLabel}</span></div><footer>{item.responseActions.map(action => <button key={action.decision} type="button" className={action.className} disabled={busy} onClick={() => onRespond(item.tenderId, action.decision)}>{action.label}</button>)}{item.packageAvailable ? <button type="button" className="btn btn-primary" onClick={() => onOpen(item)}>Open Tender Package</button> : null}</footer></article>;
}

export default function BidderTenderInbox() {
  const { user, logout } = useAuth();
  const inbox = useBidderTenderInbox();
  const access = useBidderTenderPortalAccess(user);
  const [selected, setSelected] = useState(null);
  if (!access.canAccess) return <div className="boq-state boq-state-error">Bidder workspace is available only to invited contractor accounts.</div>;
  return <div className="bidder-tender-page"><header className="bidder-tender-header"><div><strong>OpenDay Tender Portal</strong><span> · {access.displayName}</span></div><button className="btn btn-ghost" onClick={logout}>Sign out</button></header>{selected ? <TenderWorkspace summary={selected} onBack={() => setSelected(null)} /> : <main className="bidder-tender-main"><h1>Tender invitations</h1><p>Review each invitation before the Tender Package becomes available.</p>{inbox.status === 'loading' ? <div role="status">Loading invitations...</div> : null}{inbox.status === 'error' ? <div className="boq-alert boq-alert-danger">Tender invitations could not be loaded. <button className="btn btn-secondary" onClick={inbox.retry}>Retry</button></div> : null}{inbox.status === 'ready' && inbox.items.length === 0 ? <div className="card tender-prerequisite"><h2>No tender invitations</h2><p>Invitations will appear here after the project team issues them to your email address.</p></div> : null}<div className="bidder-tender-list">{inbox.items.map(item => <InvitationCard key={`${item.tenderId}-${item.participantId}`} item={item} busy={inbox.responding === item.tenderId} onRespond={inbox.respond} onOpen={setSelected} />)}</div></main>}</div>;
}
