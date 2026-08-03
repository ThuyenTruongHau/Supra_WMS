import { useState, useEffect } from "react";
import { DownOutlined, BankOutlined, SettingOutlined } from "@ant-design/icons";
import { useAppStore } from "@/store/useAppStore";
import { useZone } from "@/hooks/useZone";
import { useLocation } from "react-router-dom";

export default function Header() {
  const location = useLocation();
  const isSettingPage = location.pathname.startsWith('/setting');
  const { data: zones, isLoading } = useZone();
  const { selectedWarehouseId, setSelectedWarehouseId, lang, setLang } =
    useAppStore();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (zones && zones.length > 0) {
      const hasAccess = zones.some((z) => z.id === selectedWarehouseId);

      if (!hasAccess) {
        setSelectedWarehouseId(zones[0].id);
      }
    }
  }, [zones, selectedWarehouseId, setSelectedWarehouseId]);

  const currentZone = zones?.find((z) => z.id === selectedWarehouseId);
  const warehouseName = currentZone
    ? currentZone.name
    : isLoading
      ? "Đang tải..."
      : "Chưa chọn kho";

  return (
    <div className="flex flex-row justify-between h-full items-center px-4 w-full">
      <h1 className="font-extrabold text-2xl pl-3 border-l-4 border-brand-primary bg-gradient-to-r from-brand-primary to-slate-800 bg-clip-text text-transparent">
        Hệ thống quản lý kho
      </h1>

      <div className="flex items-center gap-4">
        {/* 1. Bộ chọn Kho hiện tại hoặc Nhãn Cài đặt */}
        {isSettingPage ? (
          <div className="relative w-56 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-2 px-4 py-2">
            <SettingOutlined className="text-slate-400 text-lg" />
            <div className="text-sm font-semibold text-slate-700 truncate">
              Cài đặt hệ thống
            </div>
          </div>
        ) : (
          <div className="relative w-56 rounded-xl border border-brand-primary/30 bg-brand-primary/5">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex w-full items-center justify-between gap-2 bg-brand-primary/5 hover:bg-brand-primary/10 border border-brand-primary/20 px-4 py-1.5 rounded-xl cursor-pointer text-left transition-all"
            >
              <BankOutlined
                className="shrink-0 text-lg mr-2"
                style={{ color: "#3aa6a6" }}
              />
              <div className="min-w-0 flex-1 text-left">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider leading-none">
                  Kho hiện tại
                </div>
                <div className="text-sm font-semibold text-slate-700 mt-1 truncate">
                  {warehouseName}
                </div>
              </div>
              <DownOutlined
                className={`shrink-0 text-slate-400 text-xs ml-2 transition-transform duration-200 ${isOpen ? "-rotate-90" : ""}`}
              />
            </button>

            {/* Danh sách lựa chọn khi Dropdown mở */}
            {isOpen && (
              <>
                {/* Lớp phủ click ra ngoài để đóng */}
                <button
                  className="fixed inset-0 z-10"
                  onClick={() => setIsOpen(!isOpen)}
                />

                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-xl shadow-lg py-1.5 z-20 animate-in fade-in slide-in-from-top-1 duration-200">
                  {zones?.map((wh) => (
                    <button
                      key={wh.id}
                      onClick={() => {
                        setSelectedWarehouseId(wh.id);
                        setIsOpen(false);
                      }}
                      className="flex items-center justify-between w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
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
          </div>
        )}

        {/* 2. Bộ chuyển đổi Ngôn ngữ (VI / EN) */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setLang("VI")}
            className={`min-w-[44px] px-4 py-1.5 text-sm font-bold rounded-lg cursor-pointer transition-all ${lang === "VI"
                ? "bg-brand-primary text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700"
              }`}
          >
            VI
          </button>
          <button
            onClick={() => setLang("EN")}
            className={`min-w-[44px] px-4 py-1.5 text-sm font-bold rounded-lg cursor-pointer transition-all ${lang === "EN"
                ? "bg-brand-primary text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700"
              }`}
          >
            EN
          </button>
        </div>
      </div>
    </div>
  );
}
