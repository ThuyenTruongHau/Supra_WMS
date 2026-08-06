import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'

export function PublicRoute({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
    const role_canonical = useAuthStore((s) => s.role_canonical)
    
    if (isAuthenticated) {
        const role = (role_canonical || '').toLowerCase()
        const isWorker = role === 'o001' || role === 'operator'
        const targetPath = isWorker ? '/worker/vehicles' : '/report'
        return <Navigate to={targetPath} replace />
    }
    return children
}