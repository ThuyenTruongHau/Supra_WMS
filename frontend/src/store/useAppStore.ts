import { create } from "zustand";
import {
  resolveInboundType,
  resolveOutboundType,
  syncWarehouseOperationTypes,
  type WarehouseOperationType,
} from "@/config/warehouseMode";

interface AppState {
  selectedWarehouseId: number;
  inboundType: WarehouseOperationType;
  outboundType: WarehouseOperationType;
  lang: string;
  setSelectedWarehouseId: (warehouse: number) => void;
  setLang: (lang: string) => void;
}

const DEFAULT_WAREHOUSE_ID = 1;
syncWarehouseOperationTypes(DEFAULT_WAREHOUSE_ID);

export const useAppStore = create<AppState>((set) => ({
  selectedWarehouseId: DEFAULT_WAREHOUSE_ID,
  inboundType: resolveInboundType(DEFAULT_WAREHOUSE_ID),
  outboundType: resolveOutboundType(DEFAULT_WAREHOUSE_ID),
  lang: "VI",
  setSelectedWarehouseId: (selectedWarehouseId) => {
    syncWarehouseOperationTypes(selectedWarehouseId);
    set({
      selectedWarehouseId,
      inboundType: resolveInboundType(selectedWarehouseId),
      outboundType: resolveOutboundType(selectedWarehouseId),
    });
  },
  setLang: (lang) => set({ lang }),
}));
