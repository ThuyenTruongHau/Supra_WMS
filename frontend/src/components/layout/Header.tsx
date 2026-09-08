import { useState, useEffect, useMemo } from "react";
import { DownOutlined, BankOutlined } from "@ant-design/icons";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useZone } from "@/hooks/useZone";
import { isAdminRole } from "@/constants/roles";

function formatHeaderDateTime(date: Date, lang: string): string {
  const locale = lang === "EN" ? "en-GB" : "vi-VN";
  return date.toLocaleString(locale, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const EMPTY_ZONES: { id: number; name: string }[] = [];

export default function Header() {
  const { data: zonesData, isLoading, isError } = useZone();
  const zones = zonesData ?? EMPTY_ZONES;
  const zoneIdsKey = useMemo(
    () => zones.map((zone) => zone.id).join(","),
    [zones],
  );
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);
  const setSelectedWarehouseId = useAppStore((s) => s.setSelectedWarehouseId);
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const roleCanonical = useAuthStore((s) => s.role_canonical);
  const userZoneId = useAuthStore((s) => s.zone_id);
  const isAdmin = isAdminRole(roleCanonical);
  const [isOpen, setIsOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!zones.length) return;

    // Operator: khóa zone theo tài khoản, không cho đổi
    if (!isAdmin && userZoneId && userZoneId > 0) {
      const targetZoneId = Number(userZoneId);
      if (Number(selectedWarehouseId) !== targetZoneId) {
        setSelectedWarehouseId(targetZoneId);
      }
      return;
    }

    // Admin: giữ hành vi chọn zone tự do
    const currentId = Number(selectedWarehouseId);
    const hasAccess = zones.some((z) => z.id === currentId);
    const firstZoneId = zones[0]?.id;
    if (firstZoneId && (currentId <= 0 || !hasAccess)) {
      setSelectedWarehouseId(firstZoneId);
    }
  }, [
    zoneIdsKey,
    selectedWarehouseId,
    setSelectedWarehouseId,
    isAdmin,
    userZoneId,
  ]);

  const lockedZoneId =
    !isAdmin && userZoneId && userZoneId > 0 ? userZoneId : selectedWarehouseId;
  const currentZone = zones?.find((z) => z.id === lockedZoneId);
  const warehouseName = currentZone
    ? currentZone.name
    : isLoading
      ? "Đang tải..."
      : "Chưa chọn kho";

  const isConnecting = isLoading && !zones && !isError;
  const statusTone = isError ? "offline" : isConnecting ? "syncing" : "online";
  const systemStatusLabel =
    lang === "EN"
      ? statusTone === "offline"
        ? "SYSTEM  ·  OFFLINE"
        : statusTone === "syncing"
          ? "SYSTEM  ·  SYNCING"
          : "SYSTEM  ·  ONLINE"
      : statusTone === "offline"
        ? "HỆ THỐNG  ·  MẤT KẾT NỐI"
        : statusTone === "syncing"
          ? "HỆ THỐNG  ·  ĐỒNG BỘ"
          : "HỆ THỐNG  ·  HOẠT ĐỘNG";

  return (
    <div className="flex flex-row justify-between h-full items-center px-4 w-full gap-4">
      <h1 className="font-extrabold text-3xl sm:text-4xl bg-gradient-to-r from-brand-primary to-brand-dark bg-clip-text text-transparent leading-tight">
        Hệ thống quản lý kho
      </h1>
      <div
        className={`iot-status mt-1 inline-flex items-center gap-2 ${statusTone === "offline"
          ? "iot-status--offline"
          : statusTone === "syncing"
            ? "iot-status--syncing"
            : "iot-status--online"
          }`}
        title={systemStatusLabel}
        role="status"
        aria-live="polite"
      >
        <span className="iot-status__led" aria-hidden />
        <span className="iot-status__label">{systemStatusLabel}</span>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {/* Ngày giờ */}
        <time
          dateTime={now.toISOString()}
          className="hidden sm:block text-base font-semibold text-stripe-ink-mute tabular-nums whitespace-nowrap"
        >
          {formatHeaderDateTime(now, lang)}
        </time>

        {/* Admin: chọn kho. Operator: chỉ hiển thị kho được gán */}
        <div className="relative w-64 rounded-xl border border-brand-primary/40 bg-brand-primary/5 shadow-sm shrink-0">
          {isAdmin ? (
            <>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between gap-2 bg-brand-primary/10 hover:bg-brand-primary/20 border-transparent px-4 py-2 rounded-xl cursor-pointer text-left transition-all"
              >
                <BankOutlined className="shrink-0 text-xl mr-2 text-brand-primary" />
                <div className="min-w-0 flex-1 text-left">
                  <div className="text-xs font-semibold text-stripe-ink-mute uppercase tracking-wider leading-none">
                    Kho hiện tại
                  </div>
                  <div className="text-lg font-bold text-brand-dark mt-0.5 truncate">
                    {warehouseName}
                  </div>
                </div>
                <DownOutlined
                  className={`shrink-0 text-stripe-ink-mute text-xs ml-2 transition-transform duration-200 ${isOpen ? "-rotate-90" : ""}`}
                />
              </button>

              {isOpen && (
                <>
                  <button
                    className="fixed inset-0 z-10"
                    onClick={() => setIsOpen(false)}
                  />

                  <div className="absolute right-0 mt-2 w-56 bg-panel border border-stripe-hairline rounded-xl shadow-stripe-2 py-1.5 z-20 animate-in fade-in slide-in-from-top-1 duration-200">
                    {zones?.map((wh) => (
                      <button
                        key={wh.id}
                        onClick={() => {
                          setSelectedWarehouseId(wh.id);
                          setIsOpen(false);
                        }}
                        className="flex items-center justify-between w-full text-left px-4 py-2.5 text-sm text-stripe-ink-secondary hover:bg-panel-soft transition-colors cursor-pointer"
                      >
                        <span
                          className={
                            selectedWarehouseId === wh.id
                              ? "text-brand-primary font-medium"
                              : ""
                          }
                        >
                          {wh.name}
                        </span>
                        {selectedWarehouseId === wh.id && (
                          <span className="text-brand-primary text-xs font-bold">
                            ✓
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex w-full items-center gap-2 border border-brand-primary/30 px-4 py-2 rounded-xl text-left bg-brand-primary/10 shadow-sm">
              <BankOutlined className="shrink-0 text-xl mr-2 text-brand-primary" />
              <div className="min-w-0 flex-1 text-left">
                <div className="text-xs font-semibold text-stripe-ink-mute uppercase tracking-wider leading-none">
                  Kho được gán
                </div>
                <div className="text-lg font-bold text-brand-dark mt-0.5 truncate">
                  {warehouseName}
                </div>
              </div>
            </div>
          )}
        </div>


      </div>
    </div>
  );
}
