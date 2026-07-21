import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getAllowedNavItemsForRole } from '../hooks/useDefaultRoute';
import { NAV_ITEMS, ROLE_BADGE_STYLES } from '../auth/rolePermissions';

// UX-audit fix (2026-07-21): plain prefix-matching NavLink made "Portfolio"
// (/projects) light up as active for every /projects/:id/snags/* and
// /projects/:id/plans/* route too — since Snag List's own nav entry lives
// at a different top-level path (/snags), it never highlighted while a
// user was deep in a project-scoped snag/plan page, so the sidebar's
// "you are here" state actively lied. Project-scoped snag/plan URLs now
// correctly activate "Snag List" instead of "Portfolio".
function isNavItemActive(item, pathname) {
  if (item.to === '/') return pathname === '/';
  const isProjectScopedSnagOrPlan = /^\/projects\/[^/]+\/(snags|plans)(\/|$)/.test(pathname);
  if (item.to === '/projects') return pathname.startsWith('/projects') && !isProjectScopedSnagOrPlan;
  if (item.to === '/snags') return pathname === '/snags' || isProjectScopedSnagOrPlan;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function ThemeToggle({ theme, onToggle }) {
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      title={label}
      aria-label={label}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}

function Sidebar({ navRef, mobileOpen = false, onClose = () => {} }) {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [theme, setTheme] = useState(
    () => localStorage.getItem('theme') || document.documentElement.getAttribute('data-theme') || 'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Only relevant on the mobile off-canvas breakpoint (CSS-gated) — Escape
  // closes the drawer, same convention as ProjectDetailDrawer.jsx.
  useEffect(() => {
    if (!mobileOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onClose]);

  const visibleNav = getAllowedNavItemsForRole(role, NAV_ITEMS);
  const badgeStyle = ROLE_BADGE_STYLES[role] ?? {};
  const profileInitial = (user?.name || user?.email || 'O').trim().charAt(0).toUpperCase();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <aside id="primary-navigation" ref={navRef} className={`sidebar${mobileOpen ? ' sidebar-open' : ''}`} aria-label="Primary navigation">
      <div className="sidebar-brand">
        {/* Inline SVG mark — theme-adaptive via CSS vars, matches the login screen.
            (Replaces the old /logo-dark.png|/logo-light.png files that were deleted.) */}
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" role="img" aria-label="OpenDay">
          <rect width="32" height="32" rx="8" fill="var(--bg-elevated)" />
          <path d="M8 24V14l8-6 8 6v10H20v-6h-8v6H8Z" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
        </svg>
        <span>
          OpenDay
        </span>
      </div>

      <nav>
        {visibleNav.map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <Link key={item.to} to={item.to} onClick={onClose} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {user && (
          <div className="sidebar-profile-card">
            <div className="sidebar-profile-avatar" aria-hidden="true">{profileInitial}</div>
            <div className="sidebar-profile-copy">
              <div className="sidebar-user-name">{user.email || user.name}</div>
              <div className="sidebar-role-badge" style={badgeStyle}>
                {role}
              </div>
            </div>
            <button type="button" className="sidebar-logout-icon" onClick={handleLogout} title="Sign out" aria-label="Sign out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 7l5 5-5 5M20 12H9M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
        <div className="sidebar-footer-controls">
          <ThemeToggle theme={theme} onToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
        </div>
        <div className="sidebar-credit">
          by Sabir Khairullin
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
