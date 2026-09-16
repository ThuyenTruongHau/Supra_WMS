import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { SNAPSHOT_MODE } from '@/snapshot/snapshotConfig';
import { getHomePath, getHomePathFromAccess, resolveRoles } from '@/utils/authSession';

export function PublicRoute({ children }: { children: React.ReactNode }) {
  if (SNAPSHOT_MODE) return <Navigate to="/report" replace />;

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const access = useAuthStore((s) => s.access);
  const roles = useAuthStore((s) => s.roles);
  const role = useAuthStore((s) => s.role);

  if (isAuthenticated) {
    const target = access
      ? getHomePathFromAccess(access)
      : getHomePath(resolveRoles(roles, role));
    return <Navigate to={target} replace />;
  }

  return children;
}
