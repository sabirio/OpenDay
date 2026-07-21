import { Link } from 'react-router-dom';

// Field-friendly compact card — deliberately not the desktop table squeezed
// down. Shows the fields a PM needs at a glance while walking the site:
// number + trade, title, responsible stakeholder, publication state, due
// date, and location. Trade/stakeholder names are resolved from the shared
// capture catalog (same catalog the desktop capture form uses) so no second
// lookup/service is introduced.
export default function SnagFieldCard({ snag, tradeName, stakeholderName, navOrder }) {
  return (
    <Link
      className="snag-field-card"
      to={`/projects/${snag.projectId}/snags/${snag.id}`}
      state={navOrder ? { navOrder } : undefined}
    >
      <div className="snag-field-card-top">
        <span className="snag-number">#{snag.snagNumber}{tradeName ? ` · ${tradeName}` : ''}</span>
        <span className={`publication-badge is-${snag.publicationState.toLowerCase()}`}>{snag.publicationState}</span>
      </div>
      <h2>{snag.title}</h2>
      <p className="snag-field-card-stakeholder">{stakeholderName || (snag.assigneeId ? 'Assigned' : 'Unassigned')}</p>
      <div className="snag-field-card-foot">
        <span>{snag.dueDateLabel}</span>
        <span>{snag.locationLabel}</span>
      </div>
    </Link>
  );
}
