import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'

export function PublicRoute({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
    const role_canonical = useAuthStore((s) => s.role_canonical)
    
    if (isAuthenticated) {
        const targetPath = ['O001'].includes(role_canonical || '') ? '/worker/vehicles' : '/report'
        return <Navigate to={targetPath} replace />
    }
    return children
}