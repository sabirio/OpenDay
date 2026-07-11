import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getAllowedNavItemsForRole } from '../hooks/useDefaultRoute';
import { NAV_ITEMS, ROLE_BADGE_STYLES } from '../auth/rolePermissions';

function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}

function Sidebar({ mobileOpen = false, onClose = () => {} }) {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();

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

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <aside className={`sidebar${mobileOpen ? ' sidebar-open' : ''}`}>
      <div style={{ padding: '12px 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Inline SVG mark — theme-adaptive via CSS vars, matches the login screen.
            (Replaces the old /logo-dark.png|/logo-light.png files that were deleted.) */}
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" role="img" aria-label="OpenDay">
          <rect width="32" height="32" rx="8" fill="var(--bg-elevated)" />
          <path d="M8 24V14l8-6 8 6v10H20v-6h-8v6H8Z" fill="var(--accent)" />
        </svg>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          OpenDay
        </span>
      </div>

      {/* User info */}
      {user && (
        <div className="sidebar-user">
          <div className="sidebar-user-name">{user.name}</div>
          <div className="sidebar-role-badge" style={badgeStyle}>
            {role}
          </div>
        </div>
      )}

      <nav>
        {visibleNav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={onClose}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <ThemeToggle theme={theme} onToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
          {user && (
            <button className="sidebar-logout-btn" onClick={handleLogout}>
              Sign out
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
          by Sabir Khairullin
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
