import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { getHomePathForRole } from '@/constants/roles'

/** Redirect `/` theo role: admin → báo cáo, operator → trang chung. */
export function RoleHomeRedirect() {
  const roleCanonical = useAuthStore((s) => s.role_canonical)
  return <Navigate to={getHomePathForRole(roleCanonical)} replace />
}
