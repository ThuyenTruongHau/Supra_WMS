import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { getHomePathForRole } from '@/constants/roles'

export function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const roleCanonical = useAuthStore((s) => s.role_canonical)

  if (isAuthenticated) {
    return <Navigate to={getHomePathForRole(roleCanonical)} replace />
  }

  return children
}
