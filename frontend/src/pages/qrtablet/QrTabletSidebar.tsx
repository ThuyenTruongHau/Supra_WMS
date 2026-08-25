import { useState } from "react";
import { Navigate, NavLink } from "react-router-dom";
import logo_thado from "@/assets/logo_thadorobot.png";
import { useLogout } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/useAuthStore";
import {
  LogoutOutlined,
  ImportOutlined,
  ExportOutlined,
  AuditOutlined,
} from "@ant-design/icons";

interface SidebarLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
}

function SidebarLink({ to, icon, label, collapsed }: SidebarLinkProps) {
  return (
    <NavLink
      to={to}
      className="group block"
      title={collapsed ? label : undefined}
    >
      {({ isActive }) => (
        <div
          className={`flex items-center rounded-xl transition-all duration-300 py-2 ${collapsed ? "justify-center px-1.5 gap-0" : "px-3 gap-3"} ${
            isActive
              ? "text-stripe-primary-soft font-semibold bg-slate-800/40"
              : "text-slate-400 hover:text-white hover:bg-slate-800/20"
          }`}
        >
          <div
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all shrink-0 ${
              isActive
                ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/20"
                : "bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-white"
            }`}
          >
            {icon}
          </div>
          <span
            className={`text-sm tracking-wide transition-all duration-300 overflow-hidden whitespace-nowrap ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[150px]"}`}
          >
            {label}
          </span>
        </div>
      )}
    </NavLink>
  );
}

export default function QrTabletSidebar() {
  const { username, role, isAuthenticated } = useAuthStore();
  const logout = useLogout();
  const [collapsed, setCollapsed] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleSidebarClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, [data-no-collapse]")) {
      return;
    }
    setCollapsed((prev) => !prev);
  };

  return (
    <aside
      className={`relative h-screen bg-slate-900 text-white flex flex-col border-r border-slate-800 transition-all duration-300 cursor-pointer ${collapsed ? "w-[72px]" : "w-64"}`}
      onClick={handleSidebarClick}
    >
      <div
        className={`flex h-16 shrink-0 items-center border-b border-slate-800 font-bold transition-all duration-300 ${collapsed ? "justify-center px-2" : "px-6"}`}
      >
        <a
          className="flex items-center gap-2"
          href="http://thadorobot.com"
          data-no-collapse
        >
          <img
            src={logo_thado}
            className="w-8 h-8 shrink-0"
            alt="Thadorobot Logo"
          />
          <span
            className={`text-brand-primary font-extrabold text-base tracking-widest transition-all duration-300 overflow-hidden whitespace-nowrap ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[180px]"}`}
          >
            THADOROBOT
          </span>
        </a>
      </div>

      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto mt-6 px-3 overflow-x-hidden">
        <SidebarLink
          to="/qrtablet/import"
          icon={<ImportOutlined className="text-lg" />}
          label="Đơn nhập"
          collapsed={collapsed}
        />
        <SidebarLink
          to="/qrtablet/export"
          icon={<ExportOutlined className="text-lg" />}
          label="Đơn xuất"
          collapsed={collapsed}
        />
        <SidebarLink
          to="/qrtablet/inventory"
          icon={<AuditOutlined className="text-lg" />}
          label="Kiểm kê"
          collapsed={collapsed}
        />
      </nav>

      <div
        className={`border-t border-slate-800 bg-slate-950/20 p-4 flex transition-all duration-300 ${collapsed ? "flex-col gap-3 items-center justify-center" : "items-center justify-between"}`}
      >
        <div
          className={`flex items-center transition-all duration-300 ${collapsed ? "justify-center gap-0" : "gap-3"}`}
        >
          <button
            type="button"
            data-no-collapse
            className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-200 font-bold border border-slate-700 text-sm uppercase shrink-0"
          >
            {username ? username[0] : "U"}
          </button>
          <div
            className={`transition-all duration-300 overflow-hidden whitespace-nowrap ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[120px]"}`}
          >
            <div className="text-sm font-medium text-slate-300 tracking-wide">
              {username || "User"}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">
              {role || "Role"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          title="Đăng xuất"
        >
          <LogoutOutlined className="text-base" />
        </button>
      </div>
    </aside>
  );
}
