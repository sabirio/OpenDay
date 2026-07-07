import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getDefaultRouteForRole } from '../hooks/useDefaultRoute';

function Unauthorized() {
  const { role, logout } = useAuth();
  const navigate = useNavigate();

  function goHome() {
    navigate(getDefaultRouteForRole(role), { replace: true });
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="unauth-page">
      <div className="unauth-card">
        <div className="unauth-icon">403</div>
        <h1 className="unauth-title">Access Denied</h1>
        <p className="unauth-text">
          Your role <strong>{role}</strong> does not have permission to view this page.
        </p>
        <div className="unauth-actions">
          <button className="btn-primary" onClick={goHome}>
            Go to my dashboard
          </button>
          <button className="btn-ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default Unauthorized;
