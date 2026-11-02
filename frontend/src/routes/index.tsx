import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ReportPage from "@/pages/ReportPage";
import WarehouseSettingPage from "@/pages/WarehouseSettingPage";
import MainLayout from "@/components/layout/MainLayout";
import { PublicRoute } from "../components/auth/PublicRoute";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import ItemPage from "@/pages/ItemPage";
import UserSettingPage from "@/pages/UserSettingPage";
import ItemDetailPage from "@/pages/ItemDetailPage";
import OutboundPage from "@/pages/OutboundPage";
import ImportPage from "@/pages/ImportPage";
import ImportDetailPage from "@/pages/ImportDetailPage";
import ZoneSettingPage from "@/pages/ZoneSettingPage";
import UnitSettingPage from "@/pages/UnitSettingPage";
import QrCodeSettingPage from "@/pages/QrCodeSettingPage";
import OutboundDetailPage from "@/pages/OutboundDetailPage";
// import ItemSettingPage from "@/pages/ItemSettingPage";
import StocktakePage from "@/pages/StocktakePage";
import StocktakeDetailPage from "@/pages/StocktakeDetailPage";
import BacklogPage from "@/pages/BacklogPage";
import NotificationPage from "@/pages/NotificationPage";
import QrTabletInboundPage from "@/pages/qrtablet/QrTabletInboundPage";
import OperatorQrInboundPage from "@/pages/qrtablet/OperatorQrInboundPage";
import QrTabletOutboundPage from "@/pages/qrtablet/QrTabletOutboundPage";
import QrTabletOutboundDetailPage from "@/pages/qrtablet/QrTabletOutboundDetailPage";
import QrTabletStocktakePage from "@/pages/qrtablet/QrTabletStocktakePage";
import QrTabletPrintQrPage from "@/pages/qrtablet/QrTabletPrintQrPage";

import { RoleGatePage } from "../components/auth/RoleGatePage";
import { RoleHomeRedirect } from "@/components/auth/RoleHomeRedirect";
import { ModuleGate } from "@/components/auth/ModuleGate";
import { QrTabletHomeRedirect } from "@/components/auth/QrTabletHomeRedirect";
import OperatorInboundPage from "@/pages/OperatorInboundPage";
import OperatorOutboundPage from "@/pages/OperatorOutboundPage";
import OperatorSortingWavePage from "@/pages/OperatorSortingWavePage";
import OperatorOutboundDetailPage from "@/pages/OperatorOutboundDetailPage";
import OperatorMonitorPage from "@/pages/OperatorMonitorPage";
import OperatorMonitorDetailPage from "@/pages/OperatorMonitorDetailPage";
import OperatorControlTowerPage from "@/pages/OperatorControlTowerPage";


export default function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      <Route
        path="/qrtablet"
        element={
          <ProtectedRoute>
            <ModuleGate module="inbound">
              <MainLayout />
            </ModuleGate>
          </ProtectedRoute>
        }
      >
        <Route index element={<QrTabletHomeRedirect />} />
        <Route path="import" element={<ModuleGate module="inbound"><OperatorQrInboundPage /></ModuleGate>} />
        <Route path="import-vcc" element={<ModuleGate module="inbound"><QrTabletInboundPage /></ModuleGate>} />
        <Route path="export" element={<ModuleGate module="outbound"><QrTabletOutboundPage /></ModuleGate>} />
        <Route path="export/:orderId" element={<ModuleGate module="outbound"><QrTabletOutboundDetailPage /></ModuleGate>} />
        <Route path="inventory" element={<ModuleGate module="stocktake"><QrTabletStocktakePage /></ModuleGate>} />
        <Route path="print-qr" element={<ModuleGate module="inbound"><QrTabletPrintQrPage /></ModuleGate>} />
      </Route>

      {/* ── Main app with sidebar ── */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RoleHomeRedirect />} />
        <Route
          path="overview"
          element={
            <RoleGatePage
              admin={<Navigate to="/report" replace />}
              operator={<ReportPage />}
            />
          }
        />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="items" element={<ItemPage />} />
        <Route path="items/:id" element={<ItemDetailPage />} />
        <Route path="zones" element={<ZoneSettingPage />} />
        <Route path="import" element={<ModuleGate module="inbound"><RoleGatePage admin={<ImportPage />} operator={<OperatorInboundPage />} /></ModuleGate>} />
        <Route path="import/:id" element={<ImportDetailPage />} />
        <Route path="export" element={<ModuleGate module="outbound"><RoleGatePage admin={<OutboundPage />} operator={<OperatorOutboundPage />} /></ModuleGate>} />
        <Route path="export/zone/:zoneId" element={<ModuleGate module="outbound"><OperatorOutboundDetailPage /></ModuleGate>} />
        <Route path="export/sorting-waves" element={<ModuleGate module="outbound"><RoleGatePage admin={<div>Tính năng chia chọn của Admin chưa hoàn thiện</div>} operator={<OperatorSortingWavePage />} /></ModuleGate>} />
        <Route
          path="monitor"
          element={
            <ModuleGate module="outbound">
              <RoleGatePage
                admin={<Navigate to="/report" replace />}
                operator={<OperatorMonitorPage />}
              />
            </ModuleGate>
          }
        />
        <Route path="monitor/zone/:zoneId" element={<ModuleGate module="outbound"><OperatorMonitorDetailPage /></ModuleGate>} />
        <Route
          path="control-tower"
          element={
            <RoleGatePage
              admin={<Navigate to="/report" replace />}
              operator={<OperatorControlTowerPage />}
            />
          }
        />
        <Route path="export/:orderId" element={<ModuleGate module="outbound"><OutboundDetailPage /></ModuleGate>} />
        <Route path="inventory" element={<ModuleGate module="stocktake"><StocktakePage /></ModuleGate>} />
        <Route path="inventory/:id" element={<ModuleGate module="stocktake"><StocktakeDetailPage /></ModuleGate>} />
        <Route path="backlog" element={<BacklogPage />} />
        <Route path="print-qr" element={<ModuleGate module="inbound"><QrTabletPrintQrPage /></ModuleGate>} />
        {/* Các Route con ngoài WMS dropdown */}
        <Route path="report" element={<ReportPage />} />
        <Route path="notification" element={<NotificationPage />} />
        <Route path="setting" element={<div>Trang Cài Đặt</div>} />
        <Route path="setting/users" element={<UserSettingPage />} />
        <Route path="setting/warehouse" element={<WarehouseSettingPage />} />
        <Route path="setting/zones" element={<Navigate to="/zones" replace />} />
        <Route path="setting/units" element={<UnitSettingPage />} />
        <Route path="setting/qr-codes" element={<QrCodeSettingPage />} />
        <Route path="setting/entry-points" element={<Navigate to="/zones" replace />} />
        <Route path="setting/exit-points" element={<Navigate to="/setting/units" replace />} />
        {/* <Route path="setting/items" element={<ItemSettingPage />} /> */}
      </Route>
    </Routes>
  );
}
