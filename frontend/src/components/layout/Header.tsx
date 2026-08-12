import { useState, useEffect } from "react";
import { DownOutlined, BankOutlined, SettingOutlined } from "@ant-design/icons";
import { useAppStore } from "@/store/useAppStore";
import { useWarehouses } from "@/hooks/useWarehouse";
import { useLocation } from "react-router-dom";

export default function Header() {
  const location = useLocation();
  const isSettingPage = location.pathname.startsWith('/setting');
  const { data: warehouses, isLoading } = useWarehouses();
  const { selectedWarehouseId, setSelectedWarehouseId, lang, setLang } =
    useAppStore();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (warehouses && warehouses.length > 0) {
      const hasAccess = warehouses.some((z) => z.id === selectedWarehouseId);

      if (!hasAccess) {
        setSelectedWarehouseId(warehouses[0].id);
      }
    }
  }, [warehouses, selectedWarehouseId, setSelectedWarehouseId]);

  const currentWarehouse = warehouses?.find((z) => z.id === selectedWarehouseId);
  const warehouseName = currentWarehouse
    ? currentWarehouse.name || currentWarehouse.code
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
          <div className="relative flex h-14 w-72 min-w-[288px] max-w-[288px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4">
            <SettingOutlined className="text-lg text-slate-400" />
            <div className="truncate text-base font-semibold text-slate-700">
              Cài đặt hệ thống
            </div>
          </div>
        ) : (
          <div className="relative h-14 w-72 min-w-[288px] max-w-[288px] rounded-xl border border-brand-primary/30 bg-brand-primary/5">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex h-14 w-full items-center justify-between gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-4 text-left transition-all hover:bg-brand-primary/10 cursor-pointer"
            >
              <BankOutlined
                className="mr-2 shrink-0 text-xl"
                style={{ color: "#3aa6a6" }}
              />
              <div className="min-w-0 flex-1 text-left">
                <div className="text-xs uppercase leading-none tracking-wider text-slate-400">
                  Kho hiện tại
                </div>
                <div className="mt-1 truncate text-base font-semibold text-slate-700">
                  {warehouseName}
                </div>
              </div>
              <DownOutlined
                className={`ml-2 shrink-0 text-xs text-slate-400 transition-transform duration-200 ${isOpen ? "-rotate-90" : ""}`}
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

                <div className="absolute right-0 z-20 mt-2 w-72 min-w-[288px] max-w-[288px] animate-in fade-in slide-in-from-top-1 rounded-xl border border-slate-100 bg-white py-1.5 shadow-lg duration-200">
                  {warehouses?.map((wh) => (
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
