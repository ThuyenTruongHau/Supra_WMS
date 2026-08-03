import Sidebar from './Sidebar'
import Header from './Header'
import { Outlet } from 'react-router-dom'

export default function MainLayout() {
    return (
        <div className="flex h-screen w-screen overflow-hidden">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                
                <header className="shrink-0 border-b border-gray-200 bg-white px-5 shadow-sm">
                    <div className="h-16">
                        <Header />
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto bg-gray-100 p-5">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}