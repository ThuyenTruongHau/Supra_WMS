import type { ReactNode } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { isAdminRole } from '@/constants/roles'
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
  const roleCanonical = useAuthStore((s) => s.role_canonical)
  if (isAdminRole(roleCanonical)) return <>{admin}</>
  return <>{operator ?? <BlankPage />}</>
}
