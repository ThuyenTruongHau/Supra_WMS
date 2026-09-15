import { BrowserRouter, HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppRoutes from '@/routes'
import { SNAPSHOT_MODE } from '@/snapshot/snapshotConfig'

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AppRoutes />
      </Router>
    </QueryClientProvider>
  )
}
