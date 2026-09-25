import { useEffect, useMemo, useState } from "react";
import { BankOutlined, DownOutlined } from "@ant-design/icons";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useWarehouses } from "@/hooks/useWarehouse";
import { usesAllWarehouseScope } from "@/utils/authSession";
import type { WarehouseBrief } from "@/types/auth";
import type { Warehouse } from "@/types/warehouse";

type WarehouseSelectorProps = {
  className?: string;
};

function warehouseLabel(w: Warehouse | WarehouseBrief): string {
  return w.name?.trim() || w.code;
}

export default function WarehouseSelector({ className }: WarehouseSelectorProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const access = useAuthStore((s) => s.access);
  const roles = useAuthStore((s) => s.roles);
  const listAllWarehouses =
    isAuthenticated && usesAllWarehouseScope(access, roles);
  const { data: allWarehouses, isLoading: isLoadingAll } = useWarehouses({
    enabled: listAllWarehouses,
  });
  const warehouses = useMemo((): (Warehouse | WarehouseBrief)[] => {
    if (!isAuthenticated) return [];
    if (listAllWarehouses) return allWarehouses ?? [];
    return access?.warehouses ?? [];
  }, [isAuthenticated, listAllWarehouses, allWarehouses, access?.warehouses]);

  const isLoading = listAllWarehouses ? isLoadingAll : false;
  const { selectedWarehouseId, setSelectedWarehouseId } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (warehouses.length > 0) {
      const hasAccess = warehouses.some((warehouse) => warehouse.id === selectedWarehouseId);
      if (!hasAccess) {
        setSelectedWarehouseId(warehouses[0].id);
      }
    }
  }, [warehouses, selectedWarehouseId, setSelectedWarehouseId]);

  const currentWarehouse = warehouses.find(
    (warehouse) => warehouse.id === selectedWarehouseId,
  );
  const warehouseName = currentWarehouse
    ? warehouseLabel(currentWarehouse)
    : isLoading
      ? "Đang tải..."
      : "Chưa chọn kho";

  return (
    <div
      className={`relative h-14 w-72 min-w-[288px] max-w-[288px] rounded-xl border border-brand-primary/30 bg-brand-primary/5 ${className ?? ""}`}
    >
      <button
        type="button"
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

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            aria-label="Đóng danh sách kho"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute right-0 z-20 mt-2 w-72 min-w-[288px] max-w-[288px] animate-in fade-in slide-in-from-top-1 rounded-xl border border-slate-100 bg-white py-1.5 shadow-lg duration-200">
            {warehouses.map((warehouse) => (
              <button
                key={warehouse.id}
                type="button"
                onClick={() => {
                  setSelectedWarehouseId(warehouse.id);
                  setIsOpen(false);
                }}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
              >
                <span
                  className={
                    selectedWarehouseId === warehouse.id
                      ? "font-medium text-brand-primary"
                      : ""
                  }
                >
                  {warehouseLabel(warehouse)}
                </span>
                {selectedWarehouseId === warehouse.id && (
                  <span className="text-xs font-bold text-brand-primary">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
