import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getAllowedNavItems } from '../engines/permissionEngine';
import { NAV_ITEMS, ROLE_BADGE_STYLES } from '../auth/rolePermissions';

function Sidebar() {
  const { user, role, logout } = useAuth();

  const visibleNav = getAllowedNavItems(role, NAV_ITEMS);
  const badgeStyle = ROLE_BADGE_STYLES[role] ?? {};

  return (
    <aside className="sidebar">
      <h2>NORYX</h2>

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
          <button className="sidebar-logout-btn" onClick={logout}>
            Sign out
          </button>
        )}
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 12 }}>
          by Sabir Khairullin
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
