import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@web/auth/AuthProvider';

export default function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }} className="yy-muted">
        인증 확인 중…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
