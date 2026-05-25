import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { canAccess } from '../engines/permissionEngine';

// Wrap any <Route element={…}> with this to enforce auth + optional RBAC.
// `resource` is the permission key from rolePermissions.js.
// If omitted, only authentication is checked (any logged-in user passes).
function ProtectedRoute({ children, resource }) {
  const { isAuthenticated, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (resource && !canAccess(role, resource)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

export default ProtectedRoute;
