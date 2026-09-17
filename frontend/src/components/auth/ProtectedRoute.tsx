import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { SNAPSHOT_MODE } from '@/snapshot/snapshotConfig'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // Bản demo: vào thẳng app, không cần đăng nhập.
  if (SNAPSHOT_MODE) return children

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}