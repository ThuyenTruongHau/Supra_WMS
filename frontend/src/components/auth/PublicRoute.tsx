import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { getHomePath, getHomePathFromAccess, resolveRoles } from '@/utils/authSession';

export function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const access = useAuthStore((s) => s.access);
  const roles = useAuthStore((s) => s.roles);
  const role = useAuthStore((s) => s.role);
  const role_canonical = useAuthStore((s) => s.role_canonical);

  if (isAuthenticated) {
    if (access) {
      return <Navigate to={getHomePathFromAccess(access, role_canonical)} replace />;
    }
    if (roles.length > 0 || role) {
      return <Navigate to={getHomePath(resolveRoles(roles, role))} replace />;
    }
    
    // Fallback for legacy local logic using role_canonical
    const canonical = (role_canonical || '').toLowerCase();
    const isWorker = canonical === 'o001' || canonical === 'operator';
    const targetPath = isWorker ? '/worker/vehicles' : '/report';
    return <Navigate to={targetPath} replace />;
  }

  return <>{children}</>;
}
