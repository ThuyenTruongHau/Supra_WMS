import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { getHomePathFromUser } from '@/utils/authSession'

/** Redirect `/` theo role: admin → báo cáo, operator → tổng quan (cùng trang biểu đồ). */
export function RoleHomeRedirect() {
  const user = useAuthStore((s) => s.user)
  return <Navigate to={getHomePathFromUser(user)} replace />
}
