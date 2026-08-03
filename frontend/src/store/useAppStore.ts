import { create } from 'zustand';

interface AppState {
  selectedWarehouseId: number;
  lang: string;
  setSelectedWarehouseId: (warehouse: number) => void;
  setLang: (lang: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedWarehouseId: 1,
  lang: 'VI',
  setSelectedWarehouseId: (selectedWarehouseId) => set({ selectedWarehouseId }),
  setLang: (lang) => set({ lang }),
}));
