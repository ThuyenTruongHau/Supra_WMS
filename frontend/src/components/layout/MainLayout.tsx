import { useAuthStore } from '@/store/useAuthStore'
import { isAdminRole } from '@/constants/roles'
import AdminLayout from './AdminLayout'
import UserLayout from './UserLayout'

/** Chọn layout theo role — admin và user không chia chung shell. */
export default function MainLayout() {
  const roleCanonical = useAuthStore((s) => s.role_canonical)

  if (isAdminRole(roleCanonical)) {
    return <AdminLayout />
  }

  return <UserLayout />
}
