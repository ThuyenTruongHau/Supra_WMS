import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { hasModuleAccess } from "@/utils/authSession";

/** First PDA page the signed-in modules allow. */
export function QrTabletHomeRedirect() {
  const access = useAuthStore((state) => state.user?.access);
  if (hasModuleAccess(access, "inbound")) {
    return <Navigate to="import" replace />;
  }
  if (hasModuleAccess(access, "outbound")) {
    return <Navigate to="export" replace />;
  }
  if (hasModuleAccess(access, "stocktake")) {
    return <Navigate to="inventory" replace />;
  }
  return <Navigate to="/overview" replace />;
}
