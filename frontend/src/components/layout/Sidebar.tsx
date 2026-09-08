import { useEffect, useState } from "react";
import { Navigate, Link, useLocation } from "react-router-dom";
import logo_thado from "@/assets/logo_thadorobot.png";
import { useLogout } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/useAuthStore";
import { MOCK_NOTIFICATIONS } from "@/data/mockNotifications";
import { useNotificationStore } from "@/store/useNotificationStore";
import { isAdminRole } from "@/constants/roles";
import {
  LogoutOutlined,
  BarChartOutlined,
  ShopOutlined,
  AppstoreOutlined,
  BoxPlotOutlined,
  ImportOutlined,
  ExportOutlined,
  PartitionOutlined,
  AuditOutlined,
  BellOutlined,
  SettingOutlined,
  RightOutlined,
  UserOutlined,
  HomeOutlined,
} from "@ant-design/icons";

interface SidebarLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  badge?: number;
}

interface SubLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
}

interface SidebarGroupItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

interface SidebarGroupProps {
  label: string;
  icon: React.ReactNode;
  items: SidebarGroupItem[];
  defaultOpen?: boolean;
  collapsed: boolean;
}

function isSubLinkActive(to: string, pathname: string): boolean {
  if (to === "/export") {
    if (pathname === "/export") return true;
    if (pathname.startsWith("/export/sorting-waves")) return false;
    return pathname.startsWith("/export/");
  }

  if (to === "/export/sorting-waves") {
    return (
      pathname === "/export/sorting-waves" ||
      pathname.startsWith("/export/sorting-waves/")
    );
  }

  if (to === "/dashboard") {
    return pathname === to;
  }

  return pathname === to || pathname.startsWith(`${to}/`);
}

function isGroupActive(items: SidebarGroupItem[], pathname: string) {
  return items.some((item) => isSubLinkActive(item.to, pathname));
}

function SidebarLink({ to, icon, label, collapsed, badge }: SidebarLinkProps) {
  const { pathname } = useLocation();
  const isActive = isSubLinkActive(to, pathname);

  return (
    <Link to={to} className="group block" title={collapsed ? label : undefined}>
      <div
        className={`flex items-center rounded-xl transition-all duration-300 py-2 ${collapsed ? "justify-center px-1.5 gap-0" : "px-3 gap-3"} ${
          isActive
            ? "text-stripe-primary-soft font-semibold bg-sidebar-hover/60"
            : "text-sidebar-mute hover:text-white hover:bg-sidebar-hover/40"
        }`}
      >
        <div
          className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-all shrink-0 ${
            isActive
              ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/25"
              : "bg-sidebar-hover text-sidebar-mute group-hover:bg-brand-primary/30 group-hover:text-white"
          }`}
        >
          {icon}
          {badge != null && badge > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </div>
        <span
          className={`text-sm tracking-wide transition-all duration-300 overflow-hidden whitespace-nowrap ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[150px]"}`}
        >
          {label}
        </span>
      </div>
    </Link>
  );
}

function SubLink({ to, icon, label, collapsed }: SubLinkProps) {
  const { pathname } = useLocation();
  const isActive = isSubLinkActive(to, pathname);

  return (
    <Link to={to} className="group block" title={collapsed ? label : undefined}>
      <div
        className={`flex items-center rounded-lg transition-all duration-300 py-1.5 ${collapsed ? "justify-center px-1.5 gap-0" : "px-3 gap-3"} ${
          isActive
            ? "text-stripe-primary-soft font-semibold bg-sidebar-hover/50"
            : "text-sidebar-mute hover:text-white hover:bg-sidebar-hover/30"
        }`}
      >
        <div
          className={`w-7 h-7 flex items-center justify-center rounded-md transition-all shrink-0 ${
            isActive
              ? "text-stripe-primary-soft"
              : "text-sidebar-mute/80 group-hover:text-white"
          }`}
        >
          {icon}
        </div>
        <span
          className={`text-xs tracking-wide transition-all duration-300 overflow-hidden whitespace-nowrap ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[120px]"}`}
        >
          {label}
        </span>
      </div>
    </Link>
  );
}

function SidebarGroup({
  label,
  icon,
  items,
  defaultOpen = true,
  collapsed,
}: SidebarGroupProps) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(defaultOpen);
  const isActive = isGroupActive(items, pathname);

  useEffect(() => {
    if (isActive) {
      setOpen(true);
    }
  }, [isActive]);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        title={collapsed ? label : undefined}
        onClick={() => setOpen(!open)}
        className={`group flex w-full items-center rounded-xl cursor-pointer transition-all duration-300 ${collapsed ? "justify-center px-1.5 gap-0" : "justify-between px-3 gap-3"} ${
          isActive
            ? "text-stripe-primary-soft font-semibold bg-sidebar-hover/60"
            : "text-sidebar-mute hover:text-white hover:bg-sidebar-hover/40"
        }`}
      >
        <div
          className={`flex items-center transition-all duration-300 ${collapsed ? "gap-0" : "gap-3"}`}
        >
          <div
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all shrink-0 ${
              isActive
                ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/25"
                : "bg-sidebar-hover text-sidebar-mute group-hover:bg-brand-primary/30 group-hover:text-white"
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
        <div
          className={`transition-all duration-300 overflow-hidden ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[20px] mr-1"}`}
        >
          <RightOutlined
            className={`inline-block text-xs text-sidebar-mute transition-transform duration-200 ${open ? "rotate-90" : "rotate-0"}`}
          />
        </div>
      </button>

      {open && (
        <div
          className={`flex flex-col gap-1 mt-1 transition-all duration-300 ${collapsed ? "w-full items-center gap-0.5" : "pl-4 ml-7 border-l border-sidebar-hover"}`}
        >
          {items.map((item) => (
            <SubLink key={item.to} {...item} collapsed={collapsed} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { username, role, role_canonical, isAuthenticated } = useAuthStore();
  const logout = useLogout();
  const [collapsed, setCollapsed] = useState(false);
  const { readIds } = useNotificationStore();
  const unreadNotificationCount = MOCK_NOTIFICATIONS.filter(
    (item) => !readIds.includes(item.id),
  ).length;
  const isAdmin = isAdminRole(role_canonical);

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
      className={`relative h-screen bg-sidebar text-white flex flex-col border-r border-sidebar-hover transition-all duration-300 cursor-pointer ${collapsed ? "w-[72px]" : "w-64"}`}
      onClick={handleSidebarClick}
    >
      <div
        className={`flex h-16 shrink-0 items-center border-b border-sidebar-hover font-bold transition-all duration-300 ${collapsed ? "justify-center px-2" : "px-6"}`}
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

      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto mt-6 px-3">
        {isAdmin ? (
          <>
            <SidebarLink
              to="/report"
              icon={<BarChartOutlined className="text-lg" />}
              label="Báo cáo"
              collapsed={collapsed}
            />

            <SidebarGroup
              label="Quản lý kho"
              icon={<ShopOutlined className="text-lg" />}
              items={[
                {
                  to: "/dashboard",
                  icon: <AppstoreOutlined />,
                  label: "Tổng quan",
                },
                {
                  to: "/products",
                  icon: <BoxPlotOutlined />,
                  label: "Sản phẩm",
                },
                { to: "/import", icon: <ImportOutlined />, label: "Nhập kho" },
                { to: "/export", icon: <ExportOutlined />, label: "Xuất kho" },
                {
                  to: "/export/sorting-waves",
                  icon: <PartitionOutlined />,
                  label: "Quản lý chia chọn",
                },
                { to: "/inventory", icon: <AuditOutlined />, label: "Kiểm kê" },
              ]}
              collapsed={collapsed}
            />
            <SidebarLink
              to="/notification"
              icon={<BellOutlined className="text-lg" />}
              label="Thông báo"
              collapsed={collapsed}
              badge={unreadNotificationCount}
            />
            <SidebarGroup
              label="Cài đặt"
              icon={<SettingOutlined className="text-lg" />}
              items={[
                {
                  to: "/setting/users",
                  icon: <UserOutlined />,
                  label: "Người dùng",
                },
                {
                  to: "/setting/warehouse",
                  icon: <HomeOutlined />,
                  label: "Kho",
                },
                {
                  to: "/setting/entry-points",
                  icon: <ImportOutlined />,
                  label: "Điểm nhập",
                },
                {
                  to: "/setting/exit-points",
                  icon: <ExportOutlined />,
                  label: "Điểm xuất",
                },
              ]}
              collapsed={collapsed}
            />
          </>
        ) : (
          <>
            <SidebarLink
              to="/overview"
              icon={<AppstoreOutlined className="text-lg" />}
              label="Tổng quan"
              collapsed={collapsed}
            />
            <SidebarLink
              to="/import"
              icon={<ImportOutlined className="text-lg" />}
              label="Đơn nhập"
              collapsed={collapsed}
            />
            <SidebarLink
              to="/export"
              icon={<ExportOutlined className="text-lg" />}
              label="Đơn xuất và chia chọn"
              collapsed={collapsed}
            />
            <SidebarLink
              to="/export/sorting-waves"
              icon={<PartitionOutlined className="text-lg" />}
              label="Màn hình chia chọn"
              collapsed={collapsed}
            />
          </>
        )}
      </nav>

      <div
        className={`border-t border-sidebar-hover bg-black/15 p-4 flex transition-all duration-300 ${collapsed ? "flex-col gap-3 items-center justify-center" : "items-center justify-between"}`}
      >
        <div
          className={`flex items-center transition-all duration-300 ${collapsed ? "justify-center gap-0" : "gap-3"}`}
        >
          <button
            type="button"
            data-no-collapse
            className="w-9 h-9 rounded-full bg-sidebar-hover flex items-center justify-center text-white font-bold border border-brand-primary/40 text-sm uppercase shrink-0"
          >
            {username ? username[0] : "U"}
          </button>
          <div
            className={`transition-all duration-300 overflow-hidden whitespace-nowrap ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[120px]"}`}
          >
            <div className="text-sm font-medium text-sidebar-mute tracking-wide">
              {username || "User"}
            </div>
            <div className="text-[10px] text-sidebar-mute/70 uppercase tracking-wider">
              {role || "Role"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-sidebar-mute hover:text-stripe-error p-1.5 rounded-lg hover:bg-sidebar-hover transition-colors cursor-pointer flex items-center justify-center shrink-0"
          title="Đăng xuất"
        >
          <LogoutOutlined className="text-base" />
        </button>
      </div>
    </aside>
  );
}
