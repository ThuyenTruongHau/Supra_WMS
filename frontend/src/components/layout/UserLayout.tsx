import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  OPERATOR_TABLET,
  operatorDesktopClass,
} from "@/constants/operatorDesktopSizes";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { cn } from "@/components/ui";
import { OperatorShellProvider } from "./OperatorShellContext";

/**
 * Layout trang user/operator — tách khỏi AdminLayout để zoom map khóa / UI denser
 * không ảnh hưởng trang admin.
 * Tablet: body.operator-ui + CSS zoom (xem operatorTabletScale.css).
 */
export default function UserLayout() {
  const { pathname } = useLocation();
  const [shellHeaderCollapsed, setShellHeaderCollapsed] = useState(false);
  /** Trang operator dạng board khóa cứng 1 màn — không scroll dọc toàn trang. */
  const lockPageScroll = pathname === "/import" || pathname === "/export";
  const shellContextValue = useMemo(
    () => ({ shellHeaderCollapsed, setShellHeaderCollapsed }),
    [shellHeaderCollapsed],
  );

  useEffect(() => {
    const { bodyClass } = OPERATOR_TABLET;
    document.body.classList.add(bodyClass);
    return () => {
      document.body.classList.remove(bodyClass);
    };
  }, []);

  useEffect(() => {
    setShellHeaderCollapsed(false);
  }, [pathname]);

  return (
    <OperatorShellProvider value={shellContextValue}>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {!shellHeaderCollapsed ? (
            <header className="shrink-0 border-b border-stripe-hairline bg-panel px-4 shadow-stripe-1 sm:px-5">
              <div className={operatorDesktopClass.headerHeight}>
                <Header />
              </div>
            </header>
          ) : null}

          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col bg-canvas",
              operatorDesktopClass.mainPadding,
              lockPageScroll ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </OperatorShellProvider>
  );
}
