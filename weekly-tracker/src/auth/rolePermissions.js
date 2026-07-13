// Single source of truth for roles and what each role can access.
// Add new roles or resources here — nothing else needs to change.

export const ROLES = {
  ADMIN: 'Admin',
  PM: 'PM',
  CONTRACTOR: 'Contractor',
  VIEWER: 'Viewer',
};

// Resource keys must match the `resource` prop passed to <ProtectedRoute>.
export const PERMISSIONS = {
  Admin: ['all'],  // 'all' is a wildcard — see permissionEngine.canAccess()
  PM: ['dashboard', 'projects', 'weekly_reports', 'risk_engine', 'site_visit', 'contractor_report', 'weight_audit', 'snags'],
  Contractor: ['contractor_report', 'snags'],
  Viewer: ['dashboard', 'snags'],
};

// Resources only Admin can access (via 'all' wildcard, but useful as documentation)
export const ADMIN_ONLY_RESOURCES = ['admin_users'];

// Where each role lands after a successful login
export const ROLE_REDIRECTS = {
  Admin:      '/home',
  PM:         '/home',
  Contractor: '/contractor-select',
  Viewer:     '/home',
};

// Sidebar nav items with their required resource permission
export const NAV_ITEMS = [
  { to: '/home',               label: 'Home',             resource: 'dashboard'      },
  { to: '/',                   label: 'Project Dashboard', resource: 'dashboard'      },
  { to: '/projects',           label: 'Portfolio',        resource: 'projects'       },
  { to: '/weekly-reports',     label: 'Weekly Reports',   resource: 'weekly_reports' },
  { to: '/site-visit-select',  label: 'Site Visit',       resource: 'site_visit'     },
  { to: '/risk',               label: 'Risk Dashboard',   resource: 'risk_engine'    },
  { to: '/weight-audit',       label: 'Weight Audit',     resource: 'weight_audit'   },
  { to: '/snags',                label: 'Snag List',      resource: 'snags'          },
  { to: '/admin/users',        label: 'Users',            resource: 'admin_users'    },
  // Template Editor (/admin/template-editor) route still exists but is hidden from
  // the nav until its save path (onSave -> templatesApi) is wired. See PROJECT_MEMORY.md.
];

// Role badge colours shown in the Sidebar
export const ROLE_BADGE_STYLES = {
  Admin:      { background: 'var(--status-done-bg)',  color: 'var(--status-done)'  },
  PM:         { background: 'var(--accent-subtle)',   color: 'var(--accent)'       },
  Contractor: { background: 'var(--status-warn-bg)',  color: 'var(--status-warn)'  },
  Viewer:     { background: 'var(--bg-elevated)',     color: 'var(--text-muted)'   },
};
