import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import SiteSnagObservations from '../../components/snags/site/SiteSnagObservations.jsx';
import SiteSnagPlanView from '../../components/snags/site/SiteSnagPlanView.jsx';
import SnagDetailPage from './SnagDetailPage.jsx';
import MasterDetailLayout from '../../components/shared/MasterDetailLayout.jsx';
import { useSnagWorkspace } from '../../hooks/snags/useSnagWorkspace.js';

const MODES = [
  { id: 'observations', label: 'Observations' },
  { id: 'plan', label: 'Plan' },
];

export default function SnagListPage({ projects = [] }) {
  const { projectId, snagId } = useParams();
  const navigate = useNavigate();
  const [query] = useSearchParams();
  const workspace = useSnagWorkspace(projectId);
  const project = projects.find((item) => String(item.id) === String(projectId));
  const requestedMode = query.get('view');
  const mode = MODES.some((item) => item.id === requestedMode) ? requestedMode : 'observations';
  // Selection lives entirely in the URL (:snagId) — mobileView is derived from
  // it rather than kept as separate state, so there is no way for the two to
  // desync (e.g. after the detail page's own "Back to Site Snag" link clears
  // snagId from the URL).
  const mobileView = snagId ? 'detail' : 'master';

  function modeUrl(nextMode) {
    const next = new URLSearchParams();
    if (nextMode !== 'observations') next.set('view', nextMode);
    return `/projects/${projectId}/snags${next.size ? `?${next}` : ''}`;
  }

  function selectObservation(snag) {
    navigate(`/projects/${projectId}/snags/${snag.id}`);
  }

  return (
    <div className="snag-page site-snag-page">
      <header className="snag-page-header site-snag-header">
        <div>
          <Link className="snag-back" to="/snags">All Site Snag projects</Link>
          <h1>Site Snag</h1>
          <p>{project?.storeCode || `Project ${projectId}`} · {workspace.items.length} Observations</p>
        </div>
        {workspace.model.canCreate ? <Link className="btn btn-primary snag-primary-action" to={`/field-snag/${projectId}`}>Open Field Snag List</Link> : null}
      </header>

      <nav className="detail-pane-tabs site-snag-mode-tabs" role="tablist" aria-label="Site Snag modes">
        {MODES.map((item) => (
          <Link
            key={item.id}
            to={modeUrl(item.id)}
            role="tab"
            aria-selected={mode === item.id}
            className={mode === item.id ? 'detail-tab is-active' : 'detail-tab'}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {mode === 'plan' ? (
        <SiteSnagPlanView projectId={projectId} catalog={workspace.catalog} />
      ) : (
        <MasterDetailLayout
          className="site-snag-master-detail"
          mobileView={mobileView}
          master={
            <SiteSnagObservations
              projectId={projectId}
              selectedSnagId={snagId}
              onSelect={selectObservation}
              {...workspace}
            />
          }
          detail={
            snagId ? (
              <SnagDetailPage />
            ) : (
              <div className="master-list-empty site-snag-detail-empty">Select an Observation to view its details.</div>
            )
          }
        />
      )}
    </div>
  );
}
