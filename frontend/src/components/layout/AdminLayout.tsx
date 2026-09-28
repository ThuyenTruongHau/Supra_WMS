import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

/** Layout trang admin — scroll content, padding chuẩn. Zoom map interactive thuộc canvas riêng. */
export default function AdminLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-stripe-hairline bg-panel px-5 shadow-stripe-1">
          <div className="h-16">
            <Header />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-canvas p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
