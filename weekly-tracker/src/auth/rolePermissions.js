// Single source of truth for roles and what each role can access.
// Add new roles or resources here — nothing else needs to change.

export const ROLES = {
  ADMIN: 'Admin',
  PM: 'PM',
  CONSULTANT: 'Consultant',
  CONTRACTOR: 'Contractor',
  APPROVER: 'Approver',
  EXECUTIVE: 'Executive',
};

// Resource keys must match the `resource` prop passed to <ProtectedRoute>.
export const PERMISSIONS = {
  Admin: ['all'],  // 'all' is a wildcard — see permissionEngine.canAccess()
  // 'contractor_schedule' is deliberately NOT in PM's list (Simplification
  // Phase 3C.1): the Contractor Proposed Schedule / Draft belongs to the
  // Contractor. PM review/approval is now the separate 'schedule_review'
  // resource below (Simplification Phase 4B.2) — PM must still never reach
  // the editable Draft route. See ContractorSchedule.jsx and
  // save_contractor_schedule_draft (048) for the matching page- and
  // RPC-level enforcement.
  // 'schedule_review' (Phase 4B.2): PM Review workspace for Contractor
  // schedule submissions — PM may Approve/Request Changes; Admin reaches it
  // too (via 'all' below) for read-only oversight only (see
  // PMScheduleReview.jsx's own page-level role check); Contractor and
  // Non-PM roles are deliberately excluded (Contractor never reviews their own
  // submission, Executive has no schedule-submission access at all — Phase
  // 4B.2 Section Q).
  PM: ['dashboard', 'projects', 'weekly_reports', 'risk_engine', 'site_visit', 'contractor_report', 'weight_audit', 'snags', 'projects_import', 'schedule_review', 'commercial_setup', 'boq_editor', 'consultant_boq', 'tender_setup', 'budget_workspace', 'variations', 'payments', 'closeout'],
  Consultant: ['dashboard', 'projects', 'consultant_boq'],
  Contractor: ['contractor_report', 'snags', 'contractor_schedule', 'bidder_tenders', 'variations', 'payments'],
  Approver: ['dashboard', 'projects', 'commercial_approvals'],
  Executive: ['dashboard', 'projects'],
};

// Resources only Admin can access (via 'all' wildcard, but useful as documentation)
export const ADMIN_ONLY_RESOURCES = ['admin_users', 'admin_contractor_workspace'];

// Where each role lands after a successful login
export const ROLE_REDIRECTS = {
  Admin:      '/home',
  PM:         '/home',
  Consultant: '/home',
  Contractor: '/contractor-select',
  Approver:   '/home',
  Executive:  '/home',
};

// Sidebar nav items with their required resource permission
export const NAV_ITEMS = [
  { to: '/home',               label: 'Home',             resource: 'dashboard'      },
  { to: '/',                   label: 'Project Dashboard', resource: 'dashboard'      },
  // Import Projects is deliberately NOT a top-level nav item — it's a
  // Portfolio-owned operation (Projects IA v1), reached via the "Import
  // Projects" action on the Portfolio page (/projects), not its own product
  // module. Its canonical route (/projects/import) and permission
  // ('projects_import') are unchanged; only its sidebar presence moved.
  { to: '/projects',           label: 'Portfolio',        resource: 'projects'       },
  { to: '/consultant-boqs',    label: 'Consultant BOQs',  resource: 'consultant_boq' },
  { to: '/weekly-reports',     label: 'Weekly Reports',   resource: 'weekly_reports' },
  { to: '/snags',              label: 'Site Snag',        resource: 'snags'          },
  {
    id: 'site-works',
    label: 'Site Works',
    children: [
      { to: '/site-visit-select', label: 'Site Visit', resource: 'site_visit' },
      { to: '/field-snag', label: 'Field Snag List', resource: 'snags' },
    ],
  },
  { to: '/risk',               label: 'Risk Dashboard',   resource: 'risk_engine'    },
  { to: '/weight-audit',       label: 'Weight Audit',     resource: 'weight_audit'   },
  { to: '/admin/users',        label: 'Users',            resource: 'admin_users'    },
  // Nav-only visibility gate — deliberately a different resource than the
  // 'contractor_report' one that actually guards /contractor-select's
  // <ProtectedRoute> in App.jsx. Contractors/PMs keep reaching that route
  // through their existing entry points unchanged; 'admin_contractor_workspace'
  // isn't in any non-Admin PERMISSIONS list, so only Admin's 'all' wildcard
  // lets this sidebar link render (same mechanism as the Users item above).
  { to: '/contractor-select',  label: 'Contractor Workspace', resource: 'admin_contractor_workspace' },
  // Template Editor (/admin/template-editor) route still exists but is hidden from
  // the nav until its save path (onSave -> templatesApi) is wired. See PROJECT_MEMORY.md.
];

// Role badge colours shown in the Sidebar
export const ROLE_BADGE_STYLES = {
  Admin:      { background: 'var(--status-done-bg)',  color: 'var(--status-done)'  },
  PM:         { background: 'var(--accent-subtle)',   color: 'var(--accent)'       },
  Consultant: { background: 'var(--accent-subtle)',   color: 'var(--accent)'       },
  Contractor: { background: 'var(--status-warn-bg)',  color: 'var(--status-warn)'  },
  Approver:   { background: 'var(--status-warn-bg)',  color: 'var(--status-warn)'  },
  Executive:  { background: 'var(--bg-elevated)',     color: 'var(--text-muted)'   },
};
