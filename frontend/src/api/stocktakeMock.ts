export interface MockStocktakeLocation {
  locationCode: string;
  sku: string;
  productName: string;
  lotNumber: string;
  systemQty: number;
  unit: string;
  expiryDate: string;
  warehouseId: number; // Linked to selectedWarehouseId from Zustand useAppStore
}

export interface MockStockAdjustment {
  id: string;
  locationCode: string;
  sku: string;
  productName: string;
  lotNumber: string;
  systemQty: number;
  actualQty: number;
  variance: number;
  reason: string;
  unit: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  countedBy: string;
  countedAt: string;
  warehouseId: number;
  planId?: string; // Tên/ID phiếu kiểm kê (nếu kiểm theo phiếu)
}

export interface MockStocktakePlanLocation {
  locationCode: string;
  isChecked: boolean;
  actualQty?: number;
}

export interface MockStocktakePlan {
  id: string;
  name: string;
  status: 'Pending' | 'InProgress' | 'Completed';
  warehouseId: number;
  locations: MockStocktakePlanLocation[];
  createdAt: string;
}

// Initial mock locations with warehouseId
const INITIAL_LOCATIONS: MockStocktakeLocation[] = [
  { locationCode: 'R01_C01_L1_B1', sku: 'SKU-ABS-01', productName: 'Nhựa ABS nguyên sinh A1', lotNumber: 'LOT-20260701-01', systemQty: 500, unit: 'kg', expiryDate: '2027-07-01', warehouseId: 1 },
  { locationCode: 'R01_C01_L1_B2', sku: 'SKU-ABS-02', productName: 'Nhựa ABS tái chế B2', lotNumber: 'LOT-20260702-02', systemQty: 250, unit: 'kg', expiryDate: '2027-07-02', warehouseId: 1 },
  { locationCode: 'R01_C02_L2_B1', sku: 'SKU-PP-102', productName: 'Hạt nhựa PP màu xanh', lotNumber: 'LOT-20260615-11', systemQty: 1200, unit: 'kg', expiryDate: '2028-06-15', warehouseId: 1 },
  { locationCode: 'R02_C04_L3_B1', sku: 'SKU-PE-099', productName: 'Nhựa PE mật độ cao HDPE', lotNumber: 'LOT-20260520-05', systemQty: 800, unit: 'kg', expiryDate: '2027-05-20', warehouseId: 2 },
  { locationCode: 'R03_C01_L1_B3', sku: 'SKU-PVC-05', productName: 'Bột nhựa PVC chống cháy', lotNumber: 'LOT-20260601-03', systemQty: 1500, unit: 'kg', expiryDate: '2027-12-01', warehouseId: 2 },
];

// Initial adjustments
const INITIAL_ADJUSTMENTS: MockStockAdjustment[] = [
  {
    id: 'ADJ-001',
    locationCode: 'R01_C02_L2_B1',
    sku: 'SKU-PP-102',
    productName: 'Hạt nhựa PP màu xanh',
    lotNumber: 'LOT-20260615-11',
    systemQty: 1200,
    actualQty: 1195,
    variance: -5,
    reason: 'Bao bì rách làm hao hụt nguyên liệu khi di chuyển',
    unit: 'kg',
    status: 'Pending',
    countedBy: 'Nguyen Van A',
    countedAt: '2026-07-13 09:30:15',
    warehouseId: 1,
  },
  {
    id: 'ADJ-002',
    locationCode: 'R02_C04_L3_B1',
    sku: 'SKU-PE-099',
    productName: 'Nhựa PE mật độ cao HDPE',
    lotNumber: 'LOT-20260520-05',
    systemQty: 800,
    actualQty: 810,
    variance: 10,
    reason: 'Dư thừa do đếm dư 1 bao lúc cất hàng',
    unit: 'kg',
    status: 'Approved',
    countedBy: 'Tran Thi B',
    countedAt: '2026-07-12 15:45:00',
    warehouseId: 2,
  }
];

const INITIAL_PLANS: MockStocktakePlan[] = [
  {
    id: 'PKK-001',
    name: 'Kiểm kê định kỳ Kho 1 - Tháng 7',
    status: 'Pending',
    warehouseId: 1,
    locations: [
      { locationCode: 'R01_C01_L1_B1', isChecked: false },
      { locationCode: 'R01_C01_L1_B2', isChecked: false },
      { locationCode: 'R01_C02_L2_B1', isChecked: false }
    ],
    createdAt: '2026-07-15 08:00:00'
  }
];

// LocalStorage Keys
const LOCATIONS_KEY = 'vcc_wms_mock_stocktake_locations';
const ADJUSTMENTS_KEY = 'vcc_wms_mock_stocktake_adjustments';
const PLANS_KEY = 'vcc_wms_mock_stocktake_plans';

// Helper to initialize local storage if empty
const initLocalStorage = () => {
  if (!localStorage.getItem(LOCATIONS_KEY)) {
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(INITIAL_LOCATIONS));
  }
  if (!localStorage.getItem(ADJUSTMENTS_KEY)) {
    localStorage.setItem(ADJUSTMENTS_KEY, JSON.stringify(INITIAL_ADJUSTMENTS));
  }
  if (!localStorage.getItem(PLANS_KEY)) {
    localStorage.setItem(PLANS_KEY, JSON.stringify(INITIAL_PLANS));
  }
};

export const getMockLocations = (): MockStocktakeLocation[] => {
  initLocalStorage();
  return JSON.parse(localStorage.getItem(LOCATIONS_KEY) || '[]');
};

export const getMockLocationDetail = (locationCode: string): MockStocktakeLocation | undefined => {
  const locations = getMockLocations();
  return locations.find(loc => loc.locationCode === locationCode);
};

export const getMockAdjustments = (): MockStockAdjustment[] => {
  initLocalStorage();
  return JSON.parse(localStorage.getItem(ADJUSTMENTS_KEY) || '[]');
};

export const getMockStocktakePlans = (): MockStocktakePlan[] => {
  initLocalStorage();
  return JSON.parse(localStorage.getItem(PLANS_KEY) || '[]');
};

export const createMockStocktakePlan = (name: string, warehouseId: number, locationCodes: string[]): MockStocktakePlan => {
  const plans = getMockStocktakePlans();
  const newPlan: MockStocktakePlan = {
    id: `PKK-${Date.now().toString().slice(-6)}`,
    name,
    status: 'Pending',
    warehouseId,
    locations: locationCodes.map(code => ({ locationCode: code, isChecked: false })),
    createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
  };
  plans.unshift(newPlan);
  localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  return newPlan;
};

export const updateLocationInPlan = (planId: string, locationCode: string, actualQty: number) => {
  const plans = getMockStocktakePlans();
  const planIdx = plans.findIndex(p => p.id === planId);
  if (planIdx !== -1) {
    if (plans[planIdx].status === 'Pending') {
      plans[planIdx].status = 'InProgress';
    }
    const locIdx = plans[planIdx].locations.findIndex(l => l.locationCode === locationCode);
    if (locIdx !== -1) {
      plans[planIdx].locations[locIdx].isChecked = true;
      plans[planIdx].locations[locIdx].actualQty = actualQty;
    }
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  }
};

export const completeMockStocktakePlan = (planId: string) => {
  const plans = getMockStocktakePlans();
  const planIdx = plans.findIndex(p => p.id === planId);
  if (planIdx !== -1) {
    plans[planIdx].status = 'Completed';
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  }
};

export const submitMockStocktake = (data: {
  locationCode: string;
  actualQty: number;
  reason: string;
  countedBy: string;
  planId?: string;
}): MockStockAdjustment => {
  initLocalStorage();
  const locDetail = getMockLocationDetail(data.locationCode);
  if (!locDetail) {
    throw new Error('Không tìm thấy thông tin vị trí này.');
  }

  const adjustments = getMockAdjustments();
  const variance = data.actualQty - locDetail.systemQty;

  const newAdjustment: MockStockAdjustment = {
    id: `ADJ-${Date.now().toString().slice(-6)}`,
    locationCode: data.locationCode,
    sku: locDetail.sku,
    productName: locDetail.productName,
    lotNumber: locDetail.lotNumber,
    systemQty: locDetail.systemQty,
    actualQty: data.actualQty,
    variance,
    reason: variance === 0 ? 'Kiểm kê khớp (0 chênh lệch)' : data.reason,
    unit: locDetail.unit,
    status: variance === 0 ? 'Approved' : 'Pending',
    countedBy: data.countedBy,
    countedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    warehouseId: locDetail.warehouseId,
    planId: data.planId,
  };

  adjustments.unshift(newAdjustment);
  localStorage.setItem(ADJUSTMENTS_KEY, JSON.stringify(adjustments));

  // Cập nhật trạng thái vào phiếu kiểm kê nếu có
  if (data.planId) {
    updateLocationInPlan(data.planId, data.locationCode, data.actualQty);
  }

  // If auto-approved, also update physical qty immediately in our mock locations
  if (variance === 0) {
    updateMockLocationQty(data.locationCode, data.actualQty);
  }

  return newAdjustment;
};

export const updateMockLocationQty = (locationCode: string, newQty: number) => {
  const locations = getMockLocations();
  const idx = locations.findIndex(loc => loc.locationCode === locationCode);
  if (idx !== -1) {
    locations[idx].systemQty = newQty;
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locations));
  }
};

export const approveMockAdjustment = (id: string): MockStockAdjustment => {
  const adjustments = getMockAdjustments();
  const idx = adjustments.findIndex(adj => adj.id === id);
  if (idx === -1) {
    throw new Error('Không tìm thấy phiếu chênh lệch này.');
  }

  adjustments[idx].status = 'Approved';
  localStorage.setItem(ADJUSTMENTS_KEY, JSON.stringify(adjustments));

  // Apply to physical locations
  updateMockLocationQty(adjustments[idx].locationCode, adjustments[idx].actualQty);

  return adjustments[idx];
};

export const rejectMockAdjustment = (id: string): MockStockAdjustment => {
  const adjustments = getMockAdjustments();
  const idx = adjustments.findIndex(adj => adj.id === id);
  if (idx === -1) {
    throw new Error('Không tìm thấy phiếu chênh lệch này.');
  }

  adjustments[idx].status = 'Rejected';
  localStorage.setItem(ADJUSTMENTS_KEY, JSON.stringify(adjustments));

  return adjustments[idx];
};
