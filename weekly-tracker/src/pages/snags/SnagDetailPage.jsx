import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useCaptureCatalog, useProjectContractors, useSnagCommand, useSnagDetail, useSnagProductCommand } from '../../hooks/snags/useSnagController.js';
import { buildSnagListModel, snagErrorMessage, SNAG_PRIORITIES } from '../../hooks/snags/useSnagPresentation.js';
import { SnagPriority, SnagStatus } from '../../components/snags/SnagStatus.jsx';
import SnagHistory from '../../components/snags/SnagHistory.jsx';
import EvidenceSection from '../../components/snags/EvidenceSection.jsx';

const ACTION_LABELS = {
  startSnagWork: 'Start work',
  markSnagReadyForReview: 'Submit for review',
  approveAndCloseSnag: 'Accept and close',
  unassignSnag: 'Unassign',
  rejectSnag: 'Reject correction',
  reopenSnag: 'Reopen snag',
  cancelSnag: 'Cancel snag',
};
const SIMPLE_ACTIONS = ['startSnagWork', 'markSnagReadyForReview', 'approveAndCloseSnag', 'unassignSnag'];
const REASON_ACTIONS = ['rejectSnag', 'reopenSnag', 'cancelSnag'];
const ACTION_CLASSES = { approveAndCloseSnag: 'btn btn-primary', cancelSnag: 'btn btn-danger' };

function planReturnUrl(projectId, snag) {
  if (!snag.location?.planVersionId) return null;
  return `/projects/${projectId}/plans/${snag.location.planVersionId}?placement=1&page=${snag.location.pageNumber || 1}`;
}

export default function SnagDetailPage() {
  const { projectId, snagId } = useParams();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const detail = useSnagDetail(projectId, snagId);
  const contractors = useProjectContractors(projectId);
  const catalog = useCaptureCatalog(projectId);
  const [reason, setReason] = useState('');
  const [assignee, setAssignee] = useState('');
  const [preserved, setPreserved] = useState('');
  const [details, setDetails] = useState(null);
  const [location, setLocation] = useState(null);
  const [captureForm, setCaptureForm] = useState({ title: '', description: '', tradeId: '', stakeholderId: '', priority: 'MEDIUM', dueDate: '' });
  const [comment, setComment] = useState('');
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

  const { snag, events, evidence, comments = [] } = detail.data;
  const model = buildSnagListModel([snag], {}, actor).rows[0];
  const actions = new Set(model.actions);
  const roleName = String(role || '').toUpperCase();
  const canManage = ['ADMIN', 'PM'].includes(roleName);
  const canAddEvidence = actions.has('addSnagEvidence') || canManage;
  const isCaptured = snag.publicationState === 'CAPTURED';
  const drawingReturn = planReturnUrl(projectId, snag);
  const captureReturn = query.get('capture') === '1' && drawingReturn;
  const selectedTrade = catalog.trades.find(item => item.id === (captureForm.tradeId || snag.tradeId));
  const suggestions = catalog.mappings
    .filter(item => item.trade_id === selectedTrade?.id)
    .map(item => catalog.stakeholders.find(stake => stake.id === item.stakeholder_id))
    .filter(Boolean);

  async function execute(type, payload = {}) {
    try {
      await command.execute({ type, actor, projectId, snagId, expectedVersion: snag.version, payload }, `${type}:${snag.version}`);
      setReason('');
      setPreserved('');
      setDetails(null);
      setLocation(null);
    } catch (error) {
      if (error.code === 'VERSION_CONFLICT') {
        setPreserved(reason);
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
    navigate(captureReturn ? `${captureReturn}&created=${snag.id}` : `/projects/${projectId}/snags`);
  }

  return (
    <div className="snag-page snag-detail">
      <header className="snag-page-header">
        <div>
          <Link className="snag-back" to={captureReturn || `/projects/${projectId}/snags`}>
            {captureReturn ? 'Back to drawing' : 'Back to observations'}
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

      {command.error || product.error ? (
        <div className="snag-error" role="alert">
          {snagErrorMessage(command.error || product.error)}
          {preserved ? <p>Your unsent text: "{preserved}"</p> : null}
        </div>
      ) : null}

      <div className="snag-detail-grid">
        <main>
          {isCaptured && canManage ? (
            <section className="observation-capture-card" aria-labelledby="capture-heading">
              <div>
                <h2 id="capture-heading">Complete captured Observation</h2>
                <p>The point is saved. Add responsibility and field context; Done keeps it private until Publish.</p>
              </div>
              <form onSubmit={completeCapturedObservation}>
                <label>
                  Observation title
                  <input className="ds-input" value={captureForm.title || snag.title} onChange={event => setCaptureForm({ ...captureForm, title: event.target.value })} />
                </label>
                <label>
                  Building trade
                  <select className="ds-select" value={captureForm.tradeId || snag.tradeId || ''} onChange={event => setCaptureForm({ ...captureForm, tradeId: event.target.value, stakeholderId: '' })}>
                    <option value="">Select trade</option>
                    {catalog.trades.filter(item => item.is_active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                {selectedTrade ? <div className="trade-selection" style={{ '--trade-color': selectedTrade.color }}><span aria-hidden="true" />Selected: {selectedTrade.name}</div> : null}
                <label>
                  Responsible stakeholder
                  <select className="ds-select" value={captureForm.stakeholderId || snag.stakeholderId || ''} onChange={event => setCaptureForm({ ...captureForm, stakeholderId: event.target.value })}>
                    <option value="">Select stakeholder</option>
                    {(suggestions.length ? suggestions : catalog.stakeholders).filter(item => item.is_active).map(item => (
                      <option key={item.id} value={item.id}>{item.company_name} - {item.project_role || 'Stakeholder'}</option>
                    ))}
                  </select>
                </label>
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
                <button className="btn btn-primary" disabled={product.pending}>{product.pending ? 'Saving...' : 'Done - keep Captured'}</button>
              </form>
            </section>
          ) : null}

          <section className="snag-detail-section">
            <h2>Issue</h2>
            <p>{snag.description || 'No additional description.'}</p>
            <dl className="snag-detail-data">
              <div><dt>Category</dt><dd>{snag.categoryCode}</dd></div>
              <div><dt>Discipline</dt><dd>{snag.disciplineCode}</dd></div>
              <div><dt>Assignee</dt><dd>{snag.assigneeId || 'Unassigned'}</dd></div>
              <div><dt>Creator</dt><dd>{snag.createdBy}</dd></div>
              <div><dt>Due date</dt><dd>{snag.dueDate || 'No due date'}</dd></div>
              <div><dt>Location</dt><dd>{model.locationLabel}{snag.location?.planVersionId ? ` - plan page ${snag.location.pageNumber}` : ''}</dd></div>
              <div><dt>Updated</dt><dd>{model.updatedDateTimeLabel}</dd></div>
            </dl>
          </section>

          {actions.has('updateSnagDetails') && !isCaptured ? (
            <section className="snag-detail-section">
              <h2>Update details</h2>
              <form className="snag-inline-form" onSubmit={event => { event.preventDefault(); execute('updateSnagDetails', { ...detailForm, dueDate: detailForm.dueDate || null }); }}>
                <label>Title<input className="ds-input" required value={detailForm.title} onChange={event => setDetails({ ...detailForm, title: event.target.value })} /></label>
                <label>Description<textarea className="ds-textarea" rows="3" value={detailForm.description} onChange={event => setDetails({ ...detailForm, description: event.target.value })} /></label>
                <label>Priority<select className="ds-select" value={detailForm.priority} onChange={event => setDetails({ ...detailForm, priority: event.target.value })}>{SNAG_PRIORITIES.map(value => <option key={value}>{value}</option>)}</select></label>
                <label>Due date<input className="ds-input" type="date" value={detailForm.dueDate} onChange={event => setDetails({ ...detailForm, dueDate: event.target.value })} /></label>
                <button className="btn" disabled={command.pending}>Save details</button>
              </form>
            </section>
          ) : null}

          {actions.has('updateSnagLocation') && !isCaptured ? (
            <section className="snag-detail-section">
              <h2>Update location</h2>
              <form className="snag-inline-form" onSubmit={event => { event.preventDefault(); execute('updateSnagLocation', { location: locationForm }); }}>
                <label>Zone<input className="ds-input" value={locationForm.zoneId} onChange={event => setLocation({ ...locationForm, zoneId: event.target.value })} /></label>
                <label>Level/floor<input className="ds-input" value={locationForm.level} onChange={event => setLocation({ ...locationForm, level: event.target.value })} /></label>
                <label>Room/space<input className="ds-input" value={locationForm.room} onChange={event => setLocation({ ...locationForm, room: event.target.value })} /></label>
                <label>Location description<input className="ds-input" value={locationForm.text} onChange={event => setLocation({ ...locationForm, text: event.target.value })} /></label>
                <button className="btn" disabled={command.pending}>Save location</button>
              </form>
            </section>
          ) : null}

          <EvidenceSection projectId={projectId} snag={snag} items={evidence} role={role} canAdd={canAddEvidence} onRefresh={detail.reload} />
          <section className="snag-detail-section">
            <h2>Comments</h2>
            {comments.length ? (
              <ul className="snag-comments">{comments.map(item => <li key={item.id}><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString()}</small></li>)}</ul>
            ) : <p>No comments yet.</p>}
            {roleName !== 'VIEWER' ? (
              <form className="snag-comment-form" onSubmit={async event => { event.preventDefault(); await product.execute({ type: 'addComment', projectId, snagId, body: comment }, `comment:${comment}`); setComment(''); await detail.reload(); }}>
                <label>Add comment<textarea className="ds-textarea" rows="2" value={comment} onChange={event => setComment(event.target.value)} /></label>
                <button className="btn" disabled={!comment.trim() || product.pending}>Add to Activity</button>
              </form>
            ) : null}
          </section>
          <SnagHistory events={events} />
        </main>

        <aside className="snag-actions" aria-labelledby="actions-heading">
          <h2 id="actions-heading">Available actions</h2>
          {drawingReturn ? <Link className="btn" to={drawingReturn.replace('placement=1&', '')}>Show on drawing</Link> : null}
          {actions.has('updateSnagLocation') ? <Link className="btn" to={`/projects/${projectId}/plans?snagId=${snag.id}&version=${snag.version}`}>{snag.location?.planVersionId ? 'Change plan pin' : 'Set on drawing'}</Link> : null}
          {isCaptured && canManage ? <button className="btn btn-primary" disabled={product.pending} onClick={() => product.execute({ type: 'publishObservation', projectId, snagId, expectedVersion: snag.version })}>Publish Observation</button> : null}
          {canManage ? (
            <button className="btn" disabled={product.pending} onClick={async () => {
              const result = await product.execute({ type: 'duplicateObservation', projectId, snagId, expectedVersion: snag.version });
              navigate(`/projects/${projectId}/plans/${result.snag.location.planVersionId}?placement=1&snagId=${result.snag.id}&version=${result.snag.version}&page=${result.snag.location.pageNumber || 1}`);
            }}>Duplicate</button>
          ) : null}
          {actions.has('assignSnag') ? (
            <div className="snag-action-block">
              <label>
                Assign contractor
                <select className="ds-select" value={assignee} onChange={event => setAssignee(event.target.value)}>
                  <option value="">Choose contractor</option>
                  {contractors.map(contractor => <option key={contractor.id} value={contractor.id}>{contractor.name || contractor.email}</option>)}
                </select>
              </label>
              <button className="btn" disabled={!assignee || command.pending} onClick={() => execute('assignSnag', { assigneeId: assignee })}>{snag.assigneeId ? 'Reassign' : 'Assign'}</button>
            </div>
          ) : null}
          {SIMPLE_ACTIONS.filter(type => actions.has(type)).map(type => <button className={ACTION_CLASSES[type] || 'btn'} key={type} disabled={command.pending} onClick={() => execute(type)}>{ACTION_LABELS[type]}</button>)}
          {REASON_ACTIONS.filter(type => actions.has(type)).map(type => (
            <div className="snag-action-block" key={type}>
              <label>{ACTION_LABELS[type]} reason<textarea className="ds-textarea" value={reason} onChange={event => setReason(event.target.value)} rows="2" /></label>
              <button className={ACTION_CLASSES[type] || 'btn'} disabled={command.pending || !reason.trim()} onClick={() => execute(type, { reason })}>{ACTION_LABELS[type]}</button>
            </div>
          ))}
          {canManage && snag.publicationState !== 'ARCHIVED' ? (
            <div className="snag-action-block">
              <label>Archive reason<textarea className="ds-textarea" value={reason} onChange={event => setReason(event.target.value)} rows="2" /></label>
              <button className="btn btn-ghost" disabled={!reason.trim() || product.pending} onClick={() => product.execute({ type: 'archiveObservation', projectId, snagId, expectedVersion: snag.version, payload: { reason } })}>Archive</button>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
