import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useContractorWorkspace } from '../hooks/useContractorWorkspace';

// Contractor Workspace / "My Work" — standalone page for Contractors, no
// Layout/Sidebar. Answers "what needs my attention right now": per assigned
// project, existing report status + existing actionable-snag count, with
// existing Submit Report / View Snags actions as the only ways forward.
// Deliberately not a new dashboard — an aggregation/index layer over the
// existing Contractor Report and Field Snag domains, nothing new is computed
// beyond what those domains already track.
function reportStatusFor(row) {
  if (!row.latestReport) return { text: 'No report submitted yet', tone: 'warning' };
  if (row.missingReport) {
    return { text: `Report overdue — last submitted ${row.daysSinceReport} day${row.daysSinceReport === 1 ? '' : 's'} ago`, tone: 'error' };
  }
  const when = row.daysSinceReport === 0 ? 'today' : `${row.daysSinceReport} day${row.daysSinceReport === 1 ? '' : 's'} ago`;
  return { text: `Last reported ${when}`, tone: 'success' };
}

function ProjectCard({ row, navigate }) {
  const { project, actionableSnagCount, overdueSnagCount, ...rest } = row;
  const reportStatus = reportStatusFor(rest);
  return (
    <div className="contractor-project-card">
      <div className="contractor-project-code">{project.storeCode}</div>
      <h2 className="contractor-project-name">{project.shoppingMallName}</h2>
      <div className="contractor-project-meta">
        <span>Opening: {project.targetOpeningDate || '—'}</span>
      </div>

      <div className={`contractor-work-status text-${reportStatus.tone}`}>{reportStatus.text}</div>
      {actionableSnagCount > 0 ? (
        <div className="contractor-work-status text-warning">
          {actionableSnagCount} observation{actionableSnagCount === 1 ? '' : 's'}
          {overdueSnagCount > 0 ? ` • ${overdueSnagCount} overdue` : ''}
        </div>
      ) : (
        <div className="contractor-work-status text-secondary">No actionable observations</div>
      )}

      <div className="contractor-project-actions">
        <button
          type="button"
          className="btn-primary contractor-project-btn"
          onClick={() => navigate(`/contractor-report/${project.id}`)}
        >
          Submit Report
        </button>
        <button
          type="button"
          className="btn-ghost contractor-project-btn"
          onClick={() => navigate(`/field-snag/${project.id}`)}
        >
          View Snags{actionableSnagCount > 0 ? ` (${actionableSnagCount})` : ''}
        </button>
      </div>
    </div>
  );
}

function ContractorSelect({ projects = [], reports = [] }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Project membership is the RLS-backed assigned_projects scope (the actual
  // enforced boundary — see profiles.assigned_projects / can_access_project()
  // in the migrations), not the legacy project.contractorEmail field. Admin
  // keeps its existing "see everything" bypass for testing; that inconsistency
  // between contractorEmail and assigned_projects elsewhere in the app is
  // known, pre-existing debt and is deliberately not touched here.
  //
  // Everything below — workspace rows AND the Operational Summary — is
  // derived exclusively from this already-scoped list. Nothing downstream
  // ever re-queries or re-scopes by project; a Contractor structurally
  // cannot see or infer another project's data because that project's id
  // never enters this array in the first place.
  const assignedProjects = useMemo(() => {
    if (user?.role === 'Admin') return projects;
    const assignedIds = user?.assignedProjects || [];
    return projects.filter(p => assignedIds.includes(Number(p.id)));
  }, [projects, user]);

  const { status, rows, summary } = useContractorWorkspace(assignedProjects, reports, user?.id, user?.role);
  const needsAttentionRows = rows.filter(row => row.missingReport || row.actionableSnagCount > 0);
  const upToDateRows = rows.filter(row => !row.missingReport && row.actionableSnagCount === 0);

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

      {/* My Work */}
      <main className="contractor-select-main">
        <div className="contractor-select-heading">
          <h1>My Work</h1>
          <p>What needs your attention across your assigned projects.</p>
        </div>

        {assignedProjects.length === 0 ? (
          <div className="contractor-no-projects" role="status">
            <h2>No assigned projects</h2>
            <p>Your assigned projects will appear here. Contact your project manager if you expected access.</p>
          </div>
        ) : status === 'loading' ? (
          <div className="contractor-no-projects" role="status">
            <p>Loading your work…</p>
          </div>
        ) : (
          <>
            <div className="contractor-summary" role="group" aria-label="Work summary">
              <div className="contractor-summary-tile">
                <div className="contractor-summary-value">{summary.projectCount}</div>
                <div className="contractor-summary-label">Projects</div>
              </div>
              <div className="contractor-summary-tile">
                <div className={`contractor-summary-value${summary.reportsNeedingActionCount > 0 ? ' text-error' : ''}`}>
                  {summary.reportsNeedingActionCount}
                </div>
                <div className="contractor-summary-label">Reports needing action</div>
              </div>
              <div className="contractor-summary-tile">
                <div className={`contractor-summary-value${summary.openObservationsCount > 0 ? ' text-warning' : ''}`}>
                  {summary.openObservationsCount}
                </div>
                <div className="contractor-summary-label">Open observations</div>
              </div>
              <div className="contractor-summary-tile">
                <div className={`contractor-summary-value${summary.overdueObservationsCount > 0 ? ' text-error' : ''}`}>
                  {summary.overdueObservationsCount}
                </div>
                <div className="contractor-summary-label">Overdue</div>
              </div>
            </div>

            {needsAttentionRows.length > 0 && (
              <>
                <h3 className="contractor-section-label">Needs attention</h3>
                <div className="contractor-project-grid">
                  {needsAttentionRows.map(row => <ProjectCard key={row.project.id} row={row} navigate={navigate} />)}
                </div>
              </>
            )}

            {upToDateRows.length > 0 && (
              <>
                <h3 className="contractor-section-label">Up to date</h3>
                <div className="contractor-project-grid">
                  {upToDateRows.map(row => <ProjectCard key={row.project.id} row={row} navigate={navigate} />)}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default ContractorSelect;
