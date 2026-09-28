import type { ReactNode } from 'react'
import { useAuthStore } from '@/store/useAuthStore'

import BlankPage from '@/pages/BlankPage'

/**
 * Admin thấy `admin`; role khác thấy `operator` (mặc định trang trắng).
 */
export function RoleGatePage({
  admin,
  operator,
}: {
  admin: ReactNode
  operator?: ReactNode
}) {
  const user = useAuthStore((s) => s.user)
  if (user?.access?.is_admin) return <>{admin}</>
  return <>{operator ?? <BlankPage />}</>
}
