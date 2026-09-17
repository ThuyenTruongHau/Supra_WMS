import { BrowserRouter, HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppRoutes from '@/routes'
import { SNAPSHOT_MODE } from '@/snapshot/snapshotConfig'
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
})

// Bản demo mở bằng file:// nên không có server rewrite cho deep link.
const Router = SNAPSHOT_MODE ? HashRouter : BrowserRouter

function AppContent() {
  useAuthBootstrap()
  return <AppRoutes />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AppContent />
      </Router>
    </QueryClientProvider>
  )
}
