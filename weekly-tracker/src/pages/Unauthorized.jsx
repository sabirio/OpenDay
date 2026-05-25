import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getDefaultRoute } from '../engines/permissionEngine';

function Unauthorized() {
  const { role, logout } = useAuth();
  const navigate = useNavigate();

  function goHome() {
    navigate(getDefaultRoute(role), { replace: true });
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
          <button className="btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default Unauthorized;
