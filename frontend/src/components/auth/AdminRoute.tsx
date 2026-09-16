import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { SNAPSHOT_MODE } from '@/snapshot/snapshotConfig';
import { isAdminRole, resolveRoles } from '@/utils/authSession';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  if (SNAPSHOT_MODE) return children;

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const access = useAuthStore((s) => s.access);
  const roles = useAuthStore((s) => s.roles);
  const role = useAuthStore((s) => s.role);
  const effectiveRoles = resolveRoles(roles, role);
  const isAdmin = access?.is_admin ?? isAdminRole(effectiveRoles);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/qrtablet/import" replace />;
  }

  return children;
}
