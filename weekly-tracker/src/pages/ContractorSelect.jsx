import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLES } from '../auth/rolePermissions';
import { isContractorManaged } from '../hooks/useScheduleOwnershipMode';
import {
  useContractorWorkspace,
  CONTRACTOR_WORKSPACE_FILTERS,
  filterContractorWorkspaceRows,
  rowNeedsAttention,
} from '../hooks/useContractorWorkspace';
import { useContractorDirectory } from '../hooks/useContractorDirectory';

// Contractor Workspace / "My Work" — standalone page for Contractors, no
// Layout/Sidebar. Answers "what needs my attention right now": per assigned
// project, existing report status + existing actionable-snag count, with
// existing Submit Report / View Snags actions as the only ways forward.
// Deliberately not a new dashboard — an aggregation/index layer over the
// existing Contractor Report and Field Snag domains, nothing new is computed
// beyond what those domains already track.
//
// Admin gets an additional, read-only contractor selector on this same page
// (see the Contractor Workspace sidebar link) — no separate admin route, no
// impersonation/login-as. Selecting a contractor just swaps which already-
// scoped project list and which actor identity feed the same workspace
// pipeline a real Contractor session uses.
function reportStatusFor(row) {
  // Projection Completeness Hardening: an unavailable batch projection
  // (fetch failed) also resolves reportDueState to NOT_YET_DUE via the
  // engine's own conservative fallback — but "no report due yet" is a
  // confident claim we have not actually confirmed here, so it must not be
  // shown as if it were. Checked before the NOT_YET_DUE branch below.
  if (row.scheduleProjectionAvailability === 'UNAVAILABLE') {
    return { text: 'Schedule status unavailable', tone: 'secondary' };
  }
  // Phase 3D.1: a CONTRACTOR_MANAGED project awaiting its first schedule
  // commitment has no reporting obligation yet (reportDueStateEngine.js) —
  // must read as neutral "nothing to report on yet", not the same warning
  // tone as a genuinely overdue AUTO_GENERATED/committed project.
  if (row.reportDueState === 'NOT_YET_DUE') {
    return { text: 'Awaiting schedule commitment — no report due yet', tone: 'secondary' };
  }
  if (!row.latestReport) return { text: 'No report submitted yet', tone: 'warning' };
  if (row.missingReport) {
    return { text: `Report overdue — last submitted ${row.daysSinceReport} day${row.daysSinceReport === 1 ? '' : 's'} ago`, tone: 'error' };
  }
  const when = row.daysSinceReport === 0 ? 'today' : `${row.daysSinceReport} day${row.daysSinceReport === 1 ? '' : 's'} ago`;
  return { text: `Last reported ${when}`, tone: 'success' };
}

const FILTER_TILES = [
  { key: CONTRACTOR_WORKSPACE_FILTERS.ALL, label: 'Projects', valueOf: s => s.projectCount },
  { key: CONTRACTOR_WORKSPACE_FILTERS.REPORTS, label: 'Reports needing action', valueOf: s => s.reportsNeedingActionCount, tone: 'text-error' },
  { key: CONTRACTOR_WORKSPACE_FILTERS.OBSERVATIONS, label: 'Open observations', valueOf: s => s.openObservationsCount, tone: 'text-warning' },
  { key: CONTRACTOR_WORKSPACE_FILTERS.OVERDUE, label: 'Overdue', valueOf: s => s.overdueObservationsCount, tone: 'text-error' },
];

const FILTER_SECTION_LABEL = {
  [CONTRACTOR_WORKSPACE_FILTERS.REPORTS]: 'Reports needing action',
  [CONTRACTOR_WORKSPACE_FILTERS.OBSERVATIONS]: 'Open observations',
  [CONTRACTOR_WORKSPACE_FILTERS.OVERDUE]: 'Overdue observations',
};

const FILTER_EMPTY_MESSAGE = {
  [CONTRACTOR_WORKSPACE_FILTERS.REPORTS]: 'No projects have a report that needs action.',
  [CONTRACTOR_WORKSPACE_FILTERS.OBSERVATIONS]: 'No projects have open observations.',
  [CONTRACTOR_WORKSPACE_FILTERS.OVERDUE]: 'No projects have overdue observations.',
};

function ProjectCard({ row, navigate, canEditContractorSchedule }) {
  const { project, actionableSnagCount, overdueSnagCount, ...rest } = row;
  const reportStatus = reportStatusFor(rest);
  return (
    <div className="contractor-project-card">
      <div className="contractor-project-code">{project.storeCode}</div>
      <h2 className="contractor-project-name">{project.shoppingMallName}</h2>
      <div className="contractor-project-meta">
        <span>Opening: {project.targetOpeningDate || '—'}</span>
      </div>

      {overdueSnagCount > 0 && (
        <div className="contractor-work-status contractor-work-status-strong text-error">
          {overdueSnagCount} overdue observation{overdueSnagCount === 1 ? '' : 's'}
        </div>
      )}

      <div className={`contractor-work-status text-${reportStatus.tone}`}>{reportStatus.text}</div>

      {actionableSnagCount > 0 ? (
        <div className="contractor-work-status text-warning">
          {actionableSnagCount} observation{actionableSnagCount === 1 ? '' : 's'} require action
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
          View Observations{actionableSnagCount > 0 ? ` (${actionableSnagCount})` : ''}
        </button>
        {/* Simplification Phase 3C/3C.1: only for projects whose schedule is
            contractor-managed — AUTO_GENERATED projects never show this
            action — AND only for the real, logged-in Contractor session
            (not Admin's read-only "inspect a contractor" mode, and PM no
            longer even reaches this route — see rolePermissions.js). The
            route and the save RPC both independently re-verify this same
            fact server-side; this is UX convenience, not the authorization
            boundary. Uses the canonical isContractorManaged() helper, never
            a scattered 'CONTRACTOR_MANAGED' string literal. */}
        {canEditContractorSchedule && isContractorManaged(project.scheduleOwnershipMode) && (
          <button
            type="button"
            className="btn-ghost contractor-project-btn"
            onClick={() => navigate(`/contractor-schedule/${project.id}`)}
          >
            Schedule
          </button>
        )}
      </div>
    </div>
  );
}

function ContractorSelect({ projects = [], reports = [] }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'Admin';
  // Real logged-in session role, deliberately not Admin's "view as
  // contractor" workspaceActorRole below — Admin's inspect mode stays
  // read-only regardless of which contractor is selected.
  const canEditContractorSchedule = user?.role === ROLES.CONTRACTOR;

  const { status: directoryStatus, contractors } = useContractorDirectory(isAdmin);
  const [selectedContractorId, setSelectedContractorId] = useState(null); // null = All contractors
  const [activeFilter, setActiveFilter] = useState(CONTRACTOR_WORKSPACE_FILTERS.ALL);

  const selectedContractor = useMemo(
    () => (isAdmin && selectedContractorId ? contractors.find(c => c.id === selectedContractorId) ?? null : null),
    [isAdmin, selectedContractorId, contractors]
  );

  // Project membership: for a real Contractor, the RLS-backed assigned_projects
  // scope (profiles.assigned_projects / can_access_project() in the
  // migrations), not the legacy project.contractorEmail field — that
  // inconsistency elsewhere in the app is known, pre-existing debt and is
  // deliberately not touched here. For Admin, either every project (the
  // existing "All contractors" default, unchanged) or — when a specific
  // contractor is selected — that SAME assigned_projects field read from
  // their own profile row (useContractorDirectory), so Admin's scoped view
  // is resolved from the identical canonical source a real Contractor
  // session would use, not a re-derived approximation.
  //
  // Everything below — workspace rows AND the Operational Summary — is
  // derived exclusively from this already-scoped list. Nothing downstream
  // ever re-queries or re-scopes by project; neither a Contractor nor an
  // Admin viewing a specific contractor can see or infer another
  // contractor's data, because that project's id never enters this array.
  const assignedProjects = useMemo(() => {
    if (isAdmin) {
      if (selectedContractor) {
        const ids = selectedContractor.assignedProjects || [];
        return projects.filter(p => ids.includes(Number(p.id)));
      }
      return projects; // All contractors — existing Admin default, unchanged
    }
    const assignedIds = user?.assignedProjects || [];
    return projects.filter(p => assignedIds.includes(Number(p.id)));
  }, [projects, user, isAdmin, selectedContractor]);

  // The identity the workspace is computed AS: a real Contractor's own
  // id/role, or — for Admin viewing a specific contractor — that
  // contractor's id with role 'Contractor' (so getAvailableSnagActions
  // reflects what THAT contractor could do, not what Admin could do). This
  // is read-only scoped viewing, not impersonation: no session/auth change,
  // just a different actor argument into the same pure engine.
  const workspaceActorId = selectedContractor ? selectedContractor.id : user?.id;
  const workspaceActorRole = selectedContractor ? 'Contractor' : user?.role;

  const { status, rows, summary } = useContractorWorkspace(assignedProjects, reports, workspaceActorId, workspaceActorRole);

  const filteredRows = filterContractorWorkspaceRows(rows, activeFilter);
  const needsAttentionRows = rows.filter(rowNeedsAttention);
  const upToDateRows = rows.filter(row => !rowNeedsAttention(row));

  const heading = isAdmin ? 'Contractor Workspace' : 'My Work';
  const subheading = isAdmin
    ? "Inspect a contractor's operational workload."
    : 'What needs your attention across your assigned projects.';
  const emptyStateText = selectedContractor
    ? 'No projects are currently assigned to this contractor.'
    : 'Your assigned projects will appear here. Contact your project manager if you expected access.';

  function selectContractor(value) {
    setSelectedContractorId(value || null);
    setActiveFilter(CONTRACTOR_WORKSPACE_FILTERS.ALL);
  }

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
          <span className="contractor-role-badge">{user?.role}</span>
          <span className="contractor-user-name">{user?.name}</span>
          <button type="button" className="btn-ghost-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {/* My Work / Contractor Workspace */}
      <main className="contractor-select-main">
        <div className="contractor-select-heading">
          <h1>{heading}</h1>
          <p>{subheading}</p>
        </div>

        {isAdmin && (
          <div className="contractor-admin-selector">
            <label htmlFor="contractor-workspace-picker">Viewing contractor</label>
            <select
              id="contractor-workspace-picker"
              value={selectedContractorId ?? ''}
              onChange={e => selectContractor(e.target.value)}
            >
              <option value="">All contractors</option>
              {contractors.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {directoryStatus === 'loading' && <span className="contractor-admin-selector-hint">Loading contractors…</span>}
          </div>
        )}

        {assignedProjects.length === 0 ? (
          <div className="contractor-no-projects" role="status">
            <h2>No assigned projects</h2>
            <p>{emptyStateText}</p>
          </div>
        ) : status === 'loading' ? (
          <div className="contractor-no-projects" role="status">
            <p>Loading your work…</p>
          </div>
        ) : (
          <>
            <div className="contractor-summary" role="group" aria-label="Work summary filters">
              {FILTER_TILES.map(tile => (
                <button
                  key={tile.key}
                  type="button"
                  className="contractor-summary-tile"
                  aria-pressed={activeFilter === tile.key}
                  onClick={() => setActiveFilter(tile.key)}
                >
                  <div className={`contractor-summary-value${tile.tone && tile.valueOf(summary) > 0 ? ` ${tile.tone}` : ''}`}>
                    {tile.valueOf(summary)}
                  </div>
                  <div className="contractor-summary-label">{tile.label}</div>
                </button>
              ))}
            </div>

            {activeFilter === CONTRACTOR_WORKSPACE_FILTERS.ALL ? (
              <>
                {needsAttentionRows.length > 0 && (
                  <>
                    <h3 className="contractor-section-label">Needs attention</h3>
                    <div className="contractor-project-grid">
                      {needsAttentionRows.map(row => <ProjectCard key={row.project.id} row={row} navigate={navigate} canEditContractorSchedule={canEditContractorSchedule} />)}
                    </div>
                  </>
                )}
                {upToDateRows.length > 0 && (
                  <>
                    <h3 className="contractor-section-label">Up to date</h3>
                    <div className="contractor-project-grid">
                      {upToDateRows.map(row => <ProjectCard key={row.project.id} row={row} navigate={navigate} canEditContractorSchedule={canEditContractorSchedule} />)}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <h3 className="contractor-section-label">{FILTER_SECTION_LABEL[activeFilter]}</h3>
                {filteredRows.length === 0 ? (
                  <div className="contractor-no-projects" role="status">
                    <p>{FILTER_EMPTY_MESSAGE[activeFilter]}</p>
                  </div>
                ) : (
                  <div className="contractor-project-grid">
                    {filteredRows.map(row => <ProjectCard key={row.project.id} row={row} navigate={navigate} canEditContractorSchedule={canEditContractorSchedule} />)}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default ContractorSelect;
