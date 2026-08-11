import { Link } from 'react-router-dom';
import { SnagStatus } from '../SnagStatus.jsx';

// Field-friendly compact card. Names are resolved from the shared capture
// catalog; lifecycle labels come from the canonical presentation model.
export default function SnagFieldCard({ snag, tradeName, stakeholderName, navOrder, returnTo }) {
  return (
    <Link
      className="snag-field-card"
      to={`/projects/${snag.projectId}/snags/${snag.id}`}
      state={{ ...(navOrder ? { navOrder } : {}), ...(returnTo ? { returnTo } : {}) }}
    >
      <div className="snag-field-card-top">
        <span className="snag-number">SN-{snag.snagNumber}{tradeName ? ` · ${tradeName}` : ''}</span>
        <span className={`publication-badge is-${snag.publicationState.toLowerCase()}`}>{snag.publicationState}</span>
      </div>
      <h2>{snag.title}</h2>
      <p className="snag-field-card-stakeholder"><span>Responsible</span>{stakeholderName || (snag.assigneeId ? 'Assigned' : 'Not assigned')}</p>
      <div className="snag-field-card-foot">
        <span>{snag.locationLabel}</span>
        <span className="snag-field-card-state"><SnagStatus status={snag.status} label={snag.statusLabel} tone={snag.statusTone} /> {snag.dueStateLabel} · {snag.dueDateLabel}</span>
      </div>
      <p className="snag-field-card-visibility">{snag.publicationState === 'CAPTURED' ? 'Private draft · visible only to PM/Admin' : 'Published · visible in the resolution workflow'}</p>
    </Link>
  );
}
