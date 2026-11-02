import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import type { UserModule } from "@/types/auth";
import { hasModuleAccess } from "@/utils/authSession";

/** Non-admin users without the module are sent to Tổng quan. */
export function ModuleGate({
  module,
  children,
}: {
  module: UserModule;
  children: ReactNode;
}) {
  const access = useAuthStore((state) => state.user?.access);
  if (!hasModuleAccess(access, module)) {
    return <Navigate to="/overview" replace />;
  }
  return <>{children}</>;
}
