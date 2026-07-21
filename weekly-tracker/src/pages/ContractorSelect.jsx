import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Standalone page for Contractors — no Layout/Sidebar.
// Shows only the projects the contractor is assigned to.
function ContractorSelect({ projects = [] }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Match projects by contractor email field — no manual assignment needed.
  // Admin sees all projects for testing purposes.
  const assignedProjects =
    user?.role === 'Admin'
      ? projects
      : projects.filter(
          (p) => p.contractorEmail && p.contractorEmail.toLowerCase() === user?.email?.toLowerCase(),
        );

  return (
    <div className="contractor-select-page">
      {/* Minimal top bar */}
      <header className="contractor-header">
        <div className="contractor-header-brand">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="var(--bg-elevated)" />
            <path d="M8 24V14l8-6 8 6v10H20v-6h-8v6H8Z" fill="var(--accent)" />
          </svg>
          <span>Construction PM Portal</span>
        </div>
        <div className="contractor-header-user">
          <span className="contractor-role-badge">Contractor</span>
          <span className="contractor-user-name">{user?.name}</span>
          <button type="button" className="btn-ghost-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {/* Project selector */}
      <main className="contractor-select-main">
        <div className="contractor-select-heading">
          <h1>Submit Weekly Report</h1>
          <p>Select the project for which you want to submit this week&apos;s report.</p>
        </div>

        {assignedProjects.length === 0 ? (
          <div className="contractor-no-projects" role="status">
            <h2>No assigned projects</h2>
            <p>Your assigned projects will appear here. Contact your project manager if you expected access.</p>
          </div>
        ) : (
          <div className="contractor-project-grid">
            {assignedProjects.map((project) => (
              <div key={project.id} className="contractor-project-card">
                <div className="contractor-project-code">{project.storeCode}</div>
                <h2 className="contractor-project-name">{project.shoppingMallName}</h2>
                <div className="contractor-project-meta">
                  <span>{project.city}, {project.country}</span>
                  <span
                    className={`status-badge status-${(project.projectStatus || 'Active').toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {project.projectStatus || 'Active'}
                  </span>
                </div>
                <div className="contractor-project-detail">
                  <span>Opening: {project.targetOpeningDate || '—'}</span>
                  <span>PM: {project.projectManager || '—'}</span>
                </div>
                <button
                  type="button"
                  className="btn-primary contractor-project-btn"
                  onClick={() => navigate(`/contractor-report/${project.id}`)}
                >
                  Submit Report
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default ContractorSelect;
