import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ReportPage from "@/pages/ReportPage";
import WarehouseSettingPage from "@/pages/WarehouseSettingPage";
import MainLayout from "@/components/layout/MainLayout";
import { PublicRoute } from "../components/auth/PublicRoute";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { AdminRoute } from "../components/auth/AdminRoute";
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
import QrTabletLayout from "@/pages/qrtablet/QrTabletLayout";
import QrTabletInboundPage from "@/pages/qrtablet/QrTabletInboundPage";
import QrTabletOutboundPage from "@/pages/qrtablet/QrTabletOutboundPage";
import QrTabletOutboundDetailPage from "@/pages/qrtablet/QrTabletOutboundDetailPage";
import QrTabletStocktakePage from "@/pages/qrtablet/QrTabletStocktakePage";
import QrTabletPrintQrPage from "@/pages/qrtablet/QrTabletPrintQrPage";


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
            <QrTabletLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="import" replace />} />
        <Route path="import" element={<QrTabletInboundPage />} />
        <Route path="export" element={<QrTabletOutboundPage />} />
        <Route path="export/:orderId" element={<QrTabletOutboundDetailPage />} />
        <Route path="inventory" element={<QrTabletStocktakePage />} />
        <Route path="print-qr" element={<QrTabletPrintQrPage />} />
      </Route>

      {/* ── Main app with sidebar (admin only) ── */}
      <Route
        path="/"
        element={
          <AdminRoute>
            <MainLayout />
          </AdminRoute>
        }
      >
        <Route index element={<Navigate to="/report" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="items" element={<ItemPage />} />
        <Route path="items/:id" element={<ItemDetailPage />} />
        <Route path="zones" element={<ZoneSettingPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="import/:id" element={<ImportDetailPage />} />
        <Route path="export" element={<OutboundPage />} />
        <Route path="export/:orderId" element={<OutboundDetailPage />} />
        <Route path="inventory" element={<StocktakePage />} />
        <Route path="inventory/:id" element={<StocktakeDetailPage />} />
        <Route path="backlog" element={<BacklogPage />} />
        {/* Các Route con ngoài WMS dropdown */}
        <Route path="report" element={<ReportPage />} />
        <Route path="notification" element={<div>Trang Thông báo</div>} />
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
