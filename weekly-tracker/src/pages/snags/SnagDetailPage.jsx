import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useCaptureCatalog, useSnagCommand, useSnagDetail, useSnagProductCommand } from '../../hooks/snags/useSnagController.js';
import { buildSnagListModel, resolvePreferredStakeholder, selectSnagNavigation, snagErrorMessage, SNAG_PRIORITIES } from '../../hooks/snags/useSnagPresentation.js';
import { SnagPriority, SnagStatus } from '../../components/snags/SnagStatus.jsx';
import EvidenceSection from '../../components/snags/EvidenceSection.jsx';
import SnagHistory from '../../components/snags/SnagHistory.jsx';
import { useIsMobile } from '../../hooks/shared/useViewport.js';

function planReturnUrl(projectId, snag) {
  if (!snag.location?.planVersionId) return null;
  return `/projects/${projectId}/plans/${snag.location.planVersionId}?placement=1&page=${snag.location.pageNumber || 1}`;
}

// `captureReturn` may come from a bare path with no query string (e.g. the
// Field Snag List's `/field-snag/:id` returnTo) as well as one that already
// has one (`?placement=1&page=1`) — always appending `&` broke the bare-path
// case into `.../field-snag/<id>&created=<id>`, which React Router then
// tried to match against `:snagId` instead of the intended route.
function withCreatedParam(url, snagIdValue) {
  return `${url}${url.includes('?') ? '&' : '?'}created=${snagIdValue}`;
}

// This page is a focused Observation capture/edit/review surface: one
// primary working card (form + evidence + lifecycle actions + history), not
// a management console. Publish/duplicate/archive/reassign remain reachable
// only from Site Snag's management workspace (batch publish). The
// ASSIGNED -> IN_PROGRESS -> READY_FOR_REVIEW -> CLOSED lifecycle (P0 fix:
// previously implemented only in the workflow engine and command RPC, with
// zero UI surface) is exposed here via the same canonical `actions` set
// (getAvailableSnagActions, through buildSnagListModel) every other action
// on this page already uses — no second status machine, no new statuses,
// no new RPC, no direct import of workflow/service internals.
export default function SnagDetailPage() {
  const { projectId, snagId } = useParams();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const isMobile = useIsMobile();
  const { user, role } = useAuth();
  const detail = useSnagDetail(projectId, snagId);
  const catalog = useCaptureCatalog(projectId);
  const [details, setDetails] = useState(null);
  const [location, setLocation] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [captureForm, setCaptureForm] = useState({ title: '', description: '', tradeId: '', stakeholderId: '', priority: 'MEDIUM', dueDate: '' });
  const actor = useMemo(() => ({ id: user?.id, role }), [user?.id, role]);
  const command = useSnagCommand(() => detail.reload());
  const product = useSnagProductCommand(result => result?.snag ? detail.reload() : null);

  if (detail.status === 'loading') return <div className="snag-page" role="status">Loading snag...</div>;
  if (detail.status === 'error') {
    return (
      <div className="snag-page snag-error" role="alert">
        <p>Snag could not be loaded.</p>
        <button className="btn" onClick={detail.reload}>Retry</button>
      </div>
    );
  }

  const { snag, evidence, events } = detail.data;
  const navOrder = routerLocation.state?.navOrder;
  const nav = selectSnagNavigation(navOrder, snagId);
  const goToObservation = id => navigate(`/projects/${projectId}/snags/${id}`, {
    state: { ...(navOrder ? { navOrder } : {}), ...(routerLocation.state?.returnTo ? { returnTo: routerLocation.state.returnTo } : {}) },
  });
  const model = buildSnagListModel([snag], {}, actor).rows[0];
  const actions = new Set(model.actions);
  const roleName = String(role || '').toUpperCase();
  const canManage = ['ADMIN', 'PM'].includes(roleName);
  const canAddEvidence = actions.has('addSnagEvidence') || canManage;
  const isCaptured = snag.publicationState === 'CAPTURED';
  const drawingReturn = planReturnUrl(projectId, snag);
  // Mobile Field Mode has no desktop plan-viewer route to return to — send
  // the PM back into the same field shell (defaults to Plan Mode) instead.
  const contextualReturn = routerLocation.state?.returnTo;
  const isFieldReturn = Boolean(contextualReturn?.includes('/field-snag/'));
  const captureReturn = query.get('capture') === '1' ? (contextualReturn || drawingReturn) : false;
  const detailReturn = contextualReturn || `/projects/${projectId}/snags?view=observations`;
  const selectedTrade = catalog.trades.find(item => item.id === (captureForm.tradeId || snag.tradeId));
  const suggestions = catalog.mappings
    .filter(item => item.trade_id === selectedTrade?.id)
    .map(item => catalog.stakeholders.find(stake => stake.id === item.stakeholder_id))
    .filter(Boolean);

  async function execute(type, payload = {}) {
    try {
      await command.execute({ type, actor, projectId, snagId, expectedVersion: snag.version, payload }, `${type}:${snag.version}`);
      setDetails(null);
      setLocation(null);
      setRejectReason('');
    } catch (error) {
      if (error.code === 'VERSION_CONFLICT') {
        await detail.reload();
      }
    }
  }

  const detailForm = details || { title: snag.title, description: snag.description || '', priority: snag.priority, dueDate: snag.dueDate || '' };
  const locationForm = location || { zoneId: snag.location?.zoneId || '', level: snag.location?.level || '', room: snag.location?.room || '', text: snag.location?.text || '' };

  async function completeCapturedObservation(event) {
    event.preventDefault();
    const payload = {
      title: captureForm.title || snag.title,
      description: captureForm.description || snag.description,
      priority: captureForm.priority,
    };
    if (captureForm.tradeId || snag.tradeId) payload.tradeId = captureForm.tradeId || snag.tradeId;
    if (captureForm.stakeholderId || snag.stakeholderId) payload.stakeholderId = captureForm.stakeholderId || snag.stakeholderId;
    if (captureForm.dueDate) payload.dueDate = captureForm.dueDate;
    await product.execute({
      type: 'completeCapture',
      projectId,
      snagId,
      expectedVersion: snag.version,
      payload,
    });
    navigate(captureReturn ? withCreatedParam(captureReturn, snag.id) : `/projects/${projectId}/snags`);
  }

  return (
    <div className="snag-page snag-detail">
      <header className="snag-page-header">
        <div>
          <Link className="snag-back" to={captureReturn || detailReturn}>
            {contextualReturn ? (isFieldReturn ? 'Back to Field Snag List' : 'Back to Site Snag') : captureReturn ? 'Back to drawing' : 'Back to Site Snag'}
          </Link>
          <span className="snag-number">Observation #{snag.snagNumber}</span>
          <h1>{snag.title}</h1>
          <div className="snag-detail-state">
            <span className={`publication-badge is-${snag.publicationState.toLowerCase()}`}>{snag.publicationState}</span>
            <SnagStatus status={snag.status} label={model.statusLabel} tone={model.statusTone} />
            <SnagPriority priority={snag.priority} label={model.priorityLabel} />
            <span>{model.dueStateLabel}</span>
          </div>
        </div>
      </header>

      {isMobile && nav.total > 1 ? (
        <nav className="snag-mobile-review-nav" aria-label="Observation navigation">
          <button className="btn" disabled={!nav.previousId} onClick={() => nav.previousId && goToObservation(nav.previousId)}>Previous</button>
          <span>{nav.position} of {nav.total}</span>
          <button className="btn" disabled={!nav.nextId} onClick={() => nav.nextId && goToObservation(nav.nextId)}>Next</button>
        </nav>
      ) : null}

      {command.error || product.error ? (
        <div className="snag-error" role="alert">
          {snagErrorMessage(command.error || product.error)}
        </div>
      ) : null}

      {actions.has('startSnagWork') || actions.has('markSnagReadyForReview') || actions.has('approveAndCloseSnag') || actions.has('rejectSnag') ? (
        <section className="snag-detail-section snag-lifecycle-actions" aria-labelledby="lifecycle-heading">
          <h2 id="lifecycle-heading">{canManage ? 'Review' : 'Next step'}</h2>

          {actions.has('startSnagWork') ? (
            <div className="snag-lifecycle-action">
              <p>This Observation is assigned to you. Start work once you're on it.</p>
              <button type="button" className="btn btn-primary" disabled={command.pending} onClick={() => execute('startSnagWork')}>
                {command.pending ? 'Starting…' : 'Start work'}
              </button>
            </div>
          ) : null}

          {actions.has('markSnagReadyForReview') ? (
            <div className="snag-lifecycle-action">
              <p>Add correction evidence below if you have it, then submit for PM review.</p>
              <button type="button" className="btn btn-primary" disabled={command.pending} onClick={() => execute('markSnagReadyForReview')}>
                {command.pending ? 'Submitting…' : 'Ready for review'}
              </button>
            </div>
          ) : null}

          {actions.has('approveAndCloseSnag') ? (
            <div className="snag-lifecycle-action">
              <p>Review the evidence below, then approve to close this Observation.</p>
              <button type="button" className="btn btn-primary" disabled={command.pending} onClick={() => execute('approveAndCloseSnag')}>
                {command.pending ? 'Approving…' : 'Approve & close'}
              </button>
            </div>
          ) : null}

          {actions.has('rejectSnag') ? (
            <form className="snag-inline-form snag-reject-form" onSubmit={event => { event.preventDefault(); if (!rejectReason.trim()) return; execute('rejectSnag', { reason: rejectReason.trim() }); }}>
              <label>
                Reason for rejection (required, sent back to the Contractor)
                <textarea className="ds-textarea" rows="2" required value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="What still needs to be corrected?" />
              </label>
              <button type="submit" className="btn btn-danger" disabled={command.pending || !rejectReason.trim()}>
                {command.pending ? 'Sending back…' : 'Reject — send back to Contractor'}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {isCaptured && canManage ? (
        <section className="observation-capture-card" aria-labelledby="capture-heading">
          <div>
            <h2 id="capture-heading">Complete captured Observation</h2>
            <p>The point is saved. Add responsibility and field context; Done keeps it private until Publish.</p>
          </div>
          <form id="capture-form" onSubmit={completeCapturedObservation}>
            <label>
              Observation title
              <input className="ds-input" value={captureForm.title || snag.title} onChange={event => setCaptureForm({ ...captureForm, title: event.target.value })} />
            </label>
            <div className="snag-form-row">
              <label>
                Building trade
                <select className="ds-select" value={captureForm.tradeId || snag.tradeId || ''} onChange={event => {
                  const tradeId = event.target.value;
                  const preferred = resolvePreferredStakeholder(catalog.mappings, tradeId);
                  setCaptureForm({ ...captureForm, tradeId, stakeholderId: preferred || '' });
                }}>
                  <option value="">Select trade</option>
                  {catalog.trades.filter(item => item.is_active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label>
                Responsible stakeholder
                <select className="ds-select" value={captureForm.stakeholderId || snag.stakeholderId || ''} onChange={event => setCaptureForm({ ...captureForm, stakeholderId: event.target.value })}>
                  <option value="">Select stakeholder</option>
                  {(suggestions.length ? suggestions : catalog.stakeholders).filter(item => item.is_active).map(item => (
                    <option key={item.id} value={item.id}>{item.company_name} - {item.project_role || 'Stakeholder'}</option>
                  ))}
                </select>
              </label>
            </div>
            {selectedTrade ? <div className="trade-selection" style={{ '--trade-color': selectedTrade.color }}><span aria-hidden="true" />Selected: {selectedTrade.name}</div> : null}
            <label>
              Description
              <textarea className="ds-textarea" rows="3" value={captureForm.description || snag.description} onChange={event => setCaptureForm({ ...captureForm, description: event.target.value })} placeholder="What was observed?" />
            </label>
            <div className="snag-form-row">
              <label>
                Priority
                <select className="ds-select" value={captureForm.priority} onChange={event => setCaptureForm({ ...captureForm, priority: event.target.value })}>
                  {SNAG_PRIORITIES.map(value => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Deadline
                <input className="ds-input" type="date" value={captureForm.dueDate} onChange={event => setCaptureForm({ ...captureForm, dueDate: event.target.value })} />
              </label>
            </div>
          </form>

          <EvidenceSection projectId={projectId} snag={snag} items={evidence} role={role} canAdd={canAddEvidence} onRefresh={detail.reload} />

          <button type="submit" form="capture-form" className="btn btn-primary" disabled={product.pending}>{product.pending ? 'Saving...' : 'Done - keep Captured'}</button>
        </section>
      ) : (
        <section className="observation-capture-card" aria-labelledby="edit-heading">
          <div>
            <h2 id="edit-heading">Observation details</h2>
          </div>

          <div className="snag-detail-section">
            {actions.has('updateSnagDetails') ? (
              <form className="snag-inline-form" onSubmit={event => { event.preventDefault(); execute('updateSnagDetails', { ...detailForm, dueDate: detailForm.dueDate || null }); }}>
                <label>Title<input className="ds-input" required value={detailForm.title} onChange={event => setDetails({ ...detailForm, title: event.target.value })} /></label>
                <label>Description<textarea className="ds-textarea" rows="3" value={detailForm.description} onChange={event => setDetails({ ...detailForm, description: event.target.value })} /></label>
                <div className="snag-form-row">
                  <label>Priority<select className="ds-select" value={detailForm.priority} onChange={event => setDetails({ ...detailForm, priority: event.target.value })}>{SNAG_PRIORITIES.map(value => <option key={value}>{value}</option>)}</select></label>
                  <label>Due date<input className="ds-input" type="date" value={detailForm.dueDate} onChange={event => setDetails({ ...detailForm, dueDate: event.target.value })} /></label>
                </div>
                <button className="btn btn-primary" disabled={command.pending}>{command.pending ? 'Saving...' : 'Save details'}</button>
              </form>
            ) : (
              <p>{snag.description || 'No additional description.'}</p>
            )}
          </div>

          <EvidenceSection projectId={projectId} snag={snag} items={evidence} role={role} canAdd={canAddEvidence} onRefresh={detail.reload} />

          {actions.has('updateSnagLocation') ? (
            <div className="snag-detail-section">
              <form className="snag-inline-form" onSubmit={event => { event.preventDefault(); execute('updateSnagLocation', { location: locationForm }); }}>
                <label>Zone<input className="ds-input" value={locationForm.zoneId} onChange={event => setLocation({ ...locationForm, zoneId: event.target.value })} /></label>
                <label>Level/floor<input className="ds-input" value={locationForm.level} onChange={event => setLocation({ ...locationForm, level: event.target.value })} /></label>
                <label>Room/space<input className="ds-input" value={locationForm.room} onChange={event => setLocation({ ...locationForm, room: event.target.value })} /></label>
                <label>Location description<input className="ds-input" value={locationForm.text} onChange={event => setLocation({ ...locationForm, text: event.target.value })} /></label>
                <button className="btn" disabled={command.pending}>Save location</button>
              </form>
            </div>
          ) : null}
        </section>
      )}

      <SnagHistory events={events} />
    </div>
  );
}
