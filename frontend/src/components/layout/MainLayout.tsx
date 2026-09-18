import { useAuthStore } from '@/store/useAuthStore'
import AdminLayout from './AdminLayout'
import UserLayout from './UserLayout'

/** Chọn layout theo role — admin và user không chia chung shell. */
export default function MainLayout() {
  const user = useAuthStore((s) => s.user)

  if (user?.access?.is_admin) {
    return <AdminLayout />
  }

  return <UserLayout />
}
