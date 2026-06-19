import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getAllowedNavItems } from '../engines/permissionEngine';
import { NAV_ITEMS, ROLE_BADGE_STYLES } from '../auth/rolePermissions';

function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}

function Sidebar() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();

  const visibleNav = getAllowedNavItems(role, NAV_ITEMS);
  const badgeStyle = ROLE_BADGE_STYLES[role] ?? {};

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <aside className="sidebar">
      <div style={{ padding: '12px 0 8px' }}>
        <img
          src="/openday-logo.png"
          alt="OPENDAY"
          style={{ width: '100%', maxWidth: 140, display: 'block', objectFit: 'contain' }}
        />
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
          <NavLink key={item.to} to={item.to} end={item.to === '/'}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <ThemeToggle />
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
