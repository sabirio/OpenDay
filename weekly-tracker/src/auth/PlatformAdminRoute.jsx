import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function PlatformAdminRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <div className="auth-loading"><div className="auth-loading-spinner" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user?.platformSuperadmin !== true) return <Navigate to="/unauthorized" replace />;
  return children;
}
