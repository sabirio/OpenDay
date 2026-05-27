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
  PM: ['dashboard', 'projects', 'weekly_reports', 'risk_engine', 'site_visit', 'contractor_report'],
  Contractor: ['contractor_report'],
  Viewer: ['dashboard'],
};

// Resources only Admin can access (via 'all' wildcard, but useful as documentation)
export const ADMIN_ONLY_RESOURCES = ['admin_users'];

// Where each role lands after a successful login
export const ROLE_REDIRECTS = {
  Admin: '/',
  PM: '/',
  Contractor: '/contractor-select',
  Viewer: '/',
};

// Sidebar nav items with their required resource permission
export const NAV_ITEMS = [
  { to: '/',                  label: 'Dashboard',      resource: 'dashboard' },
  { to: '/projects',          label: 'Projects',       resource: 'projects' },
  { to: '/weekly-reports',    label: 'Weekly Reports', resource: 'weekly_reports' },
  { to: '/site-visit-select', label: 'Site Visit',     resource: 'site_visit' },
  { to: '/risk-engine',       label: 'Risk Dashboard', resource: 'risk_engine' },
  { to: '/admin/users',       label: 'Users',          resource: 'admin_users' },
];

// Role badge colours shown in the Sidebar
export const ROLE_BADGE_STYLES = {
  Admin:      { background: '#1e3a5f', color: '#60a5fa' },
  PM:         { background: '#1a3a29', color: '#4ade80' },
  Contractor: { background: '#3b1d1d', color: '#f87171' },
  Viewer:     { background: '#2a2a1e', color: '#facc15' },
};
