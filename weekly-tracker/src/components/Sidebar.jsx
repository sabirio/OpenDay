import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getAllowedNavItems } from '../engines/permissionEngine';
import { NAV_ITEMS, ROLE_BADGE_STYLES } from '../auth/rolePermissions';

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
      <div style={{ padding: '4px 0 8px' }}>
        <img
          src="/logo.png"
          alt="Oryx"
          style={{ width: '100%', maxWidth: 120, display: 'block', objectFit: 'contain' }}
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
        {user && (
          <button className="sidebar-logout-btn" onClick={handleLogout}>
            Sign out
          </button>
        )}
        <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 12 }}>
          by Sabir Khairullin
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
