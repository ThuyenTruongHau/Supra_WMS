import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const isAdmin = !!user?.access?.is_admin;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/qrtablet/import" replace />;
  }

  return <>{children}</>;
}
