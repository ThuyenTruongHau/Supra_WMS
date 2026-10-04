import { useAuthStore } from '@/store/useAuthStore'
import AdminLayout from './AdminLayout'
import UserLayout from './UserLayout'
import MainLayoutRealtimeBridge from './MainLayoutRealtimeBridge'

/** Chọn layout theo role — admin và user không chia chung shell. */
export default function MainLayout() {
  const user = useAuthStore((s) => s.user)

  return (
    <>
      <MainLayoutRealtimeBridge />
      {user?.access?.is_admin ? <AdminLayout /> : <UserLayout />}
    </>
  )
}
