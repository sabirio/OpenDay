import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useProjectContractors, useSnagCommand, useSnagDetail } from '../../hooks/snags/useSnagController.js';
import { buildSnagListModel, snagErrorMessage, SNAG_PRIORITIES } from '../../hooks/snags/useSnagPresentation.js';
import { SnagPriority, SnagStatus } from '../../components/snags/SnagStatus.jsx';
import SnagHistory from '../../components/snags/SnagHistory.jsx';
const ACTION_LABELS = { startSnagWork: 'Start work', markSnagReadyForReview: 'Submit for review', approveAndCloseSnag: 'Accept and close', unassignSnag: 'Unassign', rejectSnag: 'Reject correction', reopenSnag: 'Reopen snag', cancelSnag: 'Cancel snag' };
const SIMPLE_ACTIONS = ['startSnagWork', 'markSnagReadyForReview', 'approveAndCloseSnag', 'unassignSnag'];
const REASON_ACTIONS = ['rejectSnag', 'reopenSnag', 'cancelSnag'];
const ACTION_CLASSES = { approveAndCloseSnag: 'btn btn-primary', cancelSnag: 'btn btn-danger' };
export default function SnagDetailPage() {
    const { projectId, snagId } = useParams();
    const { user, role } = useAuth();
    const detail = useSnagDetail(projectId, snagId);
    const contractors = useProjectContractors(projectId);
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [assignee, setAssignee] = useState('');
    const [preserved, setPreserved] = useState('');
    const [details, setDetails] = useState(null);
    const [location, setLocation] = useState(null);
    const actor = useMemo(() => ({ id: user?.id, role }), [user?.id, role]);
    const command = useSnagCommand(() => detail.reload());
    if (detail.status === 'loading')
        return <div className="snag-page" role="status">Loading snag…</div>;
    if (detail.status === 'error')
        return <div className="snag-page snag-error" role="alert"><p>Snag could not be loaded.</p><button className="btn" onClick={detail.reload}>Retry</button></div>;
    const { snag, events, evidence } = detail.data;
    const model = buildSnagListModel([snag], {}, actor).rows[0];
    const actions = new Set(model.actions);
    async function execute(type, payload = {}) { try {
        await command.execute({ type, actor, projectId, snagId, expectedVersion: snag.version, payload }, `${type}:${snag.version}`);
        setReason('');
        setNote('');
        setPreserved('');
        setDetails(null);
        setLocation(null);
    }
    catch (error) {
        if (error.code === 'VERSION_CONFLICT') {
            setPreserved(note || reason);
            await detail.reload();
        }
    } }
    const detailForm = details || { title: snag.title, description: snag.description || '', priority: snag.priority, dueDate: snag.dueDate || '' };
    const locationForm = location || { zoneId: snag.location?.zoneId || '', level: snag.location?.level || '', room: snag.location?.room || '', text: snag.location?.text || '' };
    return <div className="snag-page snag-detail"><header className="snag-page-header"><div><Link className="snag-back" to={`/projects/${projectId}/snags`}>Back to snag list</Link><span className="snag-number">SN-{snag.snagNumber}</span><h1>{snag.title}</h1><div className="snag-detail-state"><SnagStatus status={snag.status} label={model.statusLabel} tone={model.statusTone}/><SnagPriority priority={snag.priority} label={model.priorityLabel}/><span>{model.dueStateLabel}</span></div></div></header>{command.error ? <div className="snag-error" role="alert">{snagErrorMessage(command.error)}{preserved ? <p>Your unsent text: “{preserved}”</p> : null}</div> : null}<div className="snag-detail-grid"><main><section className="snag-detail-section"><h2>Issue</h2><p>{snag.description || 'No additional description.'}</p><dl className="snag-detail-data"><div><dt>Category</dt><dd>{snag.categoryCode}</dd></div><div><dt>Discipline</dt><dd>{snag.disciplineCode}</dd></div><div><dt>Assignee</dt><dd>{snag.assigneeId || 'Unassigned'}</dd></div><div><dt>Creator</dt><dd>{snag.createdBy}</dd></div><div><dt>Due date</dt><dd>{snag.dueDate || 'No due date'}</dd></div><div><dt>Location</dt><dd>{model.locationLabel}{snag.location?.planVersionId ? ` · plan page ${snag.location.pageNumber}` : ''}</dd></div><div><dt>Updated</dt><dd>{model.updatedDateTimeLabel}</dd></div></dl></section>{actions.has('updateSnagDetails') ? <section className="snag-detail-section"><h2>Update details</h2><form className="snag-inline-form" onSubmit={event => { event.preventDefault(); execute('updateSnagDetails', { ...detailForm, dueDate: detailForm.dueDate || null }); }}><label>Title<input className="ds-input" required value={detailForm.title} onChange={event => setDetails({ ...detailForm, title: event.target.value })}/></label><label>Description<textarea className="ds-textarea" rows="3" value={detailForm.description} onChange={event => setDetails({ ...detailForm, description: event.target.value })}/></label><label>Priority<select className="ds-select" value={detailForm.priority} onChange={event => setDetails({ ...detailForm, priority: event.target.value })}>{SNAG_PRIORITIES.map(value => <option key={value}>{value}</option>)}</select></label><label>Due date<input className="ds-input" type="date" value={detailForm.dueDate} onChange={event => setDetails({ ...detailForm, dueDate: event.target.value })}/></label><button className="btn" disabled={command.pending}>Save details</button></form></section> : null}{actions.has('updateSnagLocation') ? <section className="snag-detail-section"><h2>Update location</h2><form className="snag-inline-form" onSubmit={event => { event.preventDefault(); execute('updateSnagLocation', { location: locationForm }); }}><label>Zone<input className="ds-input" value={locationForm.zoneId} onChange={event => setLocation({ ...locationForm, zoneId: event.target.value })}/></label><label>Level/floor<input className="ds-input" value={locationForm.level} onChange={event => setLocation({ ...locationForm, level: event.target.value })}/></label><label>Room/space<input className="ds-input" value={locationForm.room} onChange={event => setLocation({ ...locationForm, room: event.target.value })}/></label><label>Description<input className="ds-input" value={locationForm.text} onChange={event => setLocation({ ...locationForm, text: event.target.value })}/></label><button className="btn" disabled={command.pending}>Save location</button></form></section> : null}<section className="snag-detail-section" aria-labelledby="evidence-heading"><h2 id="evidence-heading">Correction evidence</h2>{evidence.length ? <ul className="snag-evidence-list">{evidence.map(item => <li key={item.id}><strong>{item.evidence_type}</strong><p>{item.note || 'Evidence recorded'}</p></li>)}</ul> : <p className="snag-muted">No correction evidence yet.</p>}{actions.has('addSnagEvidence') ? <form onSubmit={event => { event.preventDefault(); execute('addSnagEvidence', { evidenceType: 'CORRECTION_NOTE', storagePath: `snag-note/${snag.id}/${snag.version}`, note }); }} className="snag-inline-form"><label>Correction note<textarea className="ds-textarea" required value={note} onChange={event => setNote(event.target.value)} rows="3"/></label><button className="btn" disabled={command.pending || !note.trim()}>Add note</button><p className="snag-help">File upload is deferred until snag-scoped private storage policies are available.</p></form> : null}</section><SnagHistory events={events}/></main><aside className="snag-actions" aria-labelledby="actions-heading"><h2 id="actions-heading">Available actions</h2>{actions.has('updateSnagLocation') ? <Link className="btn" to={`/projects/${projectId}/plans?snagId=${snag.id}&version=${snag.version}`}>{snag.location?.planVersionId ? 'Change plan pin' : 'Set on plan'}</Link> : null}{actions.has('assignSnag') ? <div className="snag-action-block"><label>Assign contractor<select className="ds-select" value={assignee} onChange={event => setAssignee(event.target.value)}><option value="">Choose contractor</option>{contractors.map(contractor => <option key={contractor.id} value={contractor.id}>{contractor.name || contractor.email}</option>)}</select></label><button className="btn" disabled={!assignee || command.pending} onClick={() => execute('assignSnag', { assigneeId: assignee })}>{snag.assigneeId ? 'Reassign' : 'Assign'}</button></div> : null}{SIMPLE_ACTIONS.filter(type => actions.has(type)).map(type => <button className={ACTION_CLASSES[type] ? ACTION_CLASSES[type] : 'btn'} key={type} disabled={command.pending} onClick={() => execute(type)}>{ACTION_LABELS[type]}</button>)}{REASON_ACTIONS.filter(type => actions.has(type)).map(type => <div className="snag-action-block" key={type}><label>{ACTION_LABELS[type]} reason<textarea className="ds-textarea" value={reason} onChange={event => setReason(event.target.value)} rows="2"/></label><button className={ACTION_CLASSES[type] ? ACTION_CLASSES[type] : 'btn'} disabled={command.pending || !reason.trim()} onClick={() => execute(type, { reason })}>{ACTION_LABELS[type]}</button></div>)}{model.actions.length === 0 ? <p className="snag-muted">This snag is read-only for your role and its current state.</p> : null}</aside></div></div>;
}
