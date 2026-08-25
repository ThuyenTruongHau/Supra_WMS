import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Header from "@/components/layout/Header";
import { configureAppMessage } from "@/components/ui/message";
import QrTabletSidebar from "./QrTabletSidebar";

/**
 * Just under typical mobile/tablet browser URL/search bar (~56–72px).
 * Avoid large vh offsets (36vh+) that push toast too deep into the page.
 */
const TABLET_MESSAGE_TOP = 0;

export default function QrTabletLayout() {
  useEffect(() => {
    document.body.classList.add("qrtablet-route");
    configureAppMessage({ top: TABLET_MESSAGE_TOP, stack: false });
    return () => {
      document.body.classList.remove("qrtablet-route");
      configureAppMessage();
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <QrTabletSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-gray-200 bg-white px-5 shadow-sm">
          <div className="h-16">
            <Header />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-gray-100 p-4 md:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
