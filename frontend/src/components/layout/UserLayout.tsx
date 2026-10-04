import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  OPERATOR_STAGE,
  OPERATOR_TABLET,
  operatorDesktopClass,
} from "@/constants/operatorDesktopSizes";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { cn } from "@/components/ui";
import { OperatorShellProvider } from "./OperatorShellContext";
import { operatorStageEl } from "./operatorStage";

/**
 * Layout operator — desktop (>1280px): full viewport như cũ, không letterbox.
 * Tablet / màn nhỏ (≤1280px): sân khấu 1920×1080 + scale để giữ bố cục desktop.
 * AdminLayout không đi qua đây.
 */
export default function UserLayout() {
  const { pathname } = useLocation();
  const [shellHeaderCollapsed, setShellHeaderCollapsed] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const lockPageScroll = pathname === "/import" || pathname === "/export";
  const isQrTablet = pathname.startsWith("/qrtablet");
  /** Chỉ tablet / TV nhỏ — desktop rộng không bọc stage (tránh viền 2 bên). */
  const useOperatorStage =
    !isQrTablet && viewport.width <= OPERATOR_TABLET.wideMaxPx;

  const shellContextValue = useMemo(
    () => ({ shellHeaderCollapsed, setShellHeaderCollapsed }),
    [shellHeaderCollapsed],
  );

  /** Tablet: scale theo full width, cao stage = viewport/scale → không viền trống. */
  const stageLayout = useMemo(() => {
    if (!useOperatorStage) return null;
    const w = viewport.width;
    const h = viewport.height;
    if (w <= 0 || h <= 0) return null;
    const scale = w / OPERATOR_STAGE.width;
    const stageHeight = h / scale;
    return {
      scale,
      offsetX: 0,
      offsetY: 0,
      width: OPERATOR_STAGE.width,
      height: stageHeight,
    };
  }, [useOperatorStage, viewport.width, viewport.height]);

  useEffect(() => {
    const { bodyClass } = OPERATOR_TABLET;
    document.body.classList.add(bodyClass);
    return () => {
      document.body.classList.remove(bodyClass);
      document.body.classList.remove("operator-stage-active");
    };
  }, []);

  useEffect(() => {
    if (useOperatorStage) {
      document.body.classList.add("operator-stage-active");
    } else {
      document.body.classList.remove("operator-stage-active");
    }
  }, [useOperatorStage]);

  useEffect(() => {
    const update = () => {
      const vv = window.visualViewport;
      setViewport({
        width: Math.round(vv?.width ?? window.innerWidth),
        height: Math.round(vv?.height ?? window.innerHeight),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    if (!useOperatorStage) {
      operatorStageEl.current = null;
    }
  }, [useOperatorStage]);

  useEffect(() => {
    return () => {
      operatorStageEl.current = null;
    };
  }, []);

  useEffect(() => {
    setShellHeaderCollapsed(false);
  }, [pathname]);

  const shell = (
    <div
      className={cn(
        "flex overflow-hidden",
        isQrTablet || useOperatorStage ? "h-full w-full" : "h-screen w-screen",
      )}
    >
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
  );

  return (
    <OperatorShellProvider value={shellContextValue}>
      {isQrTablet ? (
        shell
      ) : useOperatorStage && stageLayout ? (
        <div className="fixed inset-0 overflow-hidden bg-canvas">
          <div
            ref={(node) => {
              operatorStageEl.current = node;
            }}
            className="operator-stage @container absolute top-0 left-0"
            style={{
              width: stageLayout.width,
              height: stageLayout.height,
              transform: `translate(${stageLayout.offsetX}px, ${stageLayout.offsetY}px) scale(${stageLayout.scale})`,
              transformOrigin: "top left",
            }}
          >
            {shell}
          </div>
        </div>
      ) : (
        <div className="@container flex h-screen w-screen overflow-hidden">
          {shell}
        </div>
      )}
    </OperatorShellProvider>
  );
}
