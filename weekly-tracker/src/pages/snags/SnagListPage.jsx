import { Link, useParams, useSearchParams } from 'react-router-dom';
import SiteSnagObservations from '../../components/snags/site/SiteSnagObservations.jsx';
import SiteSnagOverview from '../../components/snags/site/SiteSnagOverview.jsx';
import SiteSnagPlanView from '../../components/snags/site/SiteSnagPlanView.jsx';
import { useSnagWorkspace } from '../../hooks/snags/useSnagWorkspace.js';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'plan', label: 'Plan' },
  { id: 'observations', label: 'Observations' },
];

export default function SnagListPage({ projects = [] }) {
  const { projectId } = useParams();
  const [query] = useSearchParams();
  const workspace = useSnagWorkspace(projectId);
  const project = projects.find((item) => String(item.id) === String(projectId));
  const requestedSection = query.get('view');
  const section = SECTIONS.some((item) => item.id === requestedSection) ? requestedSection : 'overview';

  const sectionUrl = (nextSection) => {
    const next = new URLSearchParams();
    if (nextSection !== 'overview') next.set('view', nextSection);
    return `/projects/${projectId}/snags${next.size ? `?${next}` : ''}`;
  };

  return (
    <div className="snag-page site-snag-page">
      <header className="snag-page-header site-snag-header">
        <div>
          <Link className="snag-back" to="/snags">All Site Snag projects</Link>
          <h1>Site Snag</h1>
          <p>{project?.storeCode || `Project ${projectId}`} · {workspace.items.length} Observations</p>
        </div>
        {workspace.model.canCreate ? <Link className="btn btn-primary snag-primary-action" to={`/projects/${projectId}/snags/field`}>Open Field Snag List</Link> : null}
      </header>

      <nav className="site-snag-tabs" aria-label="Site Snag sections">
        {SECTIONS.map((item) => (
          <Link key={item.id} to={sectionUrl(item.id)} className={section === item.id ? 'active' : undefined} aria-current={section === item.id ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="site-snag-panel" data-section={section}>
        {section === 'overview' ? <SiteSnagOverview status={workspace.status} error={workspace.error} items={workspace.items} catalog={workspace.catalog} reload={workspace.reload} /> : null}
        {section === 'plan' ? <SiteSnagPlanView projectId={projectId} catalog={workspace.catalog} /> : null}
        {section === 'observations' ? <SiteSnagObservations projectId={projectId} {...workspace} /> : null}
      </div>
    </div>
  );
}
