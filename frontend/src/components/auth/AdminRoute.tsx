import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { getHomePathForRole, isAdminRole } from '@/constants/roles'

/** Chỉ cho phép role admin vào các route con; role khác về trang chung. */
export function AdminRoute() {
  const roleCanonical = useAuthStore((s) => s.role_canonical)

  if (!isAdminRole(roleCanonical)) {
    return <Navigate to={getHomePathForRole(roleCanonical)} replace />
  }

  return <Outlet />
}
