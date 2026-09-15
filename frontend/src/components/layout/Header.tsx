import { SettingOutlined } from "@ant-design/icons";
import { useAppStore } from "@/store/useAppStore";
import { useLocation } from "react-router-dom";
import WarehouseSelector from "@/components/shared/WarehouseSelector";

export default function Header() {
  const location = useLocation();
  const isSettingPage = location.pathname.startsWith('/setting');
  const { lang, setLang } = useAppStore();

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
          <WarehouseSelector />
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
