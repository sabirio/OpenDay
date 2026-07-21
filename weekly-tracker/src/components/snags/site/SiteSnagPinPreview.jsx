import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSnagDetail } from '../../../hooks/snags/useSnagController.js';
import { buildSnagListModel } from '../../../hooks/snags/useSnagPresentation.js';
import { SnagStatus } from '../SnagStatus.jsx';
import EvidenceItem from '../EvidenceItem.jsx';

export default function SiteSnagPinPreview({ projectId, snagId, catalog, returnTo, onClose }) {
  const panelRef = useRef(null);
  const detail = useSnagDetail(projectId, snagId);

  useEffect(() => {
    panelRef.current?.focus();
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <aside ref={panelRef} className="site-snag-pin-preview" tabIndex="-1" aria-labelledby="pin-preview-heading">
      <div className="site-snag-pin-preview-header">
        <h2 id="pin-preview-heading">Observation preview</h2>
        <button type="button" className="ds-modal-close" onClick={onClose} aria-label="Close Observation preview">×</button>
      </div>
      {detail.status === 'loading' ? <div role="status">Loading Observation…</div> : null}
      {detail.status === 'error' ? <div className="snag-error" role="alert"><p>Observation preview could not be loaded.</p><button className="btn" onClick={detail.reload}>Retry</button></div> : null}
      {detail.status === 'ready' ? <PinPreviewContent detail={detail.data} catalog={catalog} projectId={projectId} returnTo={returnTo} /> : null}
    </aside>
  );
}

function PinPreviewContent({ detail, catalog, projectId, returnTo }) {
  const { snag, evidence = [] } = detail;
  const model = buildSnagListModel([snag], {}, {}).rows[0];
  const trade = catalog.trades.find((item) => String(item.id) === String(snag.tradeId));
  const stakeholder = catalog.stakeholders.find((item) => String(item.id) === String(snag.stakeholderId));
  return (
    <div className="site-snag-pin-preview-body">
      <span className="snag-number">Observation #{snag.snagNumber}</span>
      <h3>{snag.title}</h3>
      <div className="snag-detail-state"><span className={`publication-badge is-${snag.publicationState.toLowerCase()}`}>{snag.publicationState}</span><SnagStatus status={snag.status} label={model.statusLabel} tone={model.statusTone} />{model.dueState === 'OVERDUE' ? <span className="snag-status snag-status-danger">Overdue</span> : null}</div>
      {snag.description ? <p>{snag.description}</p> : <p className="snag-muted">No description has been added.</p>}
      <dl className="snag-detail-data">
        <div><dt>Trade</dt><dd>{trade?.name || 'Not assigned'}</dd></div>
        <div><dt>Responsible</dt><dd>{stakeholder?.company_name || stakeholder?.name || 'Not assigned'}</dd></div>
        <div><dt>Due</dt><dd>{model.dueDateLabel}</dd></div>
      </dl>
      <section className="site-snag-preview-evidence" aria-labelledby="pin-preview-evidence-heading">
        <h3 id="pin-preview-evidence-heading">Evidence</h3>
        {evidence.length ? <ul className="snag-evidence-list">{evidence.map((item) => <EvidenceItem key={item.id} item={item} />)}</ul> : <p className="snag-muted">No evidence attached.</p>}
      </section>
      <Link className="btn btn-primary" to={`/projects/${projectId}/snags/${snag.id}`} state={{ returnTo }}>View Observation</Link>
    </div>
  );
}
