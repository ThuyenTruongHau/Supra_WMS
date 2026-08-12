import React from 'react';
import {
  NODE_NORMAL_COLOR,
  SHELF_EMPTY_COLOR,
  SHELF_FULL_COLOR,
  SHELF_RESERVED_COLOR,
  SHELF_IN_TRANSIT_COLOR,
  SHELF_STROKE_COLOR,
} from '@/utils/warehouseMapUtils';

const LEGEND_ITEMS = [
  {
    key: 'waypoint',
    label: 'Waypoint',
    shape: 'circle' as const,
    color: NODE_NORMAL_COLOR,
    border: undefined,
  },
  {
    key: 'empty',
    label: 'Kệ trống',
    shape: 'square' as const,
    color: SHELF_EMPTY_COLOR,
    border: SHELF_STROKE_COLOR,
  },
  {
    key: 'has_stock',
    label: 'Có hàng',
    shape: 'square' as const,
    color: SHELF_FULL_COLOR,
    border: SHELF_STROKE_COLOR,
  },
  {
    key: 'reserved',
    label: 'Giữ chỗ',
    shape: 'square' as const,
    color: SHELF_RESERVED_COLOR,
    border: SHELF_STROKE_COLOR,
  },
  {
    key: 'in_transit',
    label: 'Đang luân chuyển',
    shape: 'square' as const,
    color: SHELF_IN_TRANSIT_COLOR,
    border: SHELF_STROKE_COLOR,
  },
];

const WarehouseMapLegend: React.FC = () => {
  return (
    <div className="absolute bottom-3 right-3 z-20 flex max-w-[min(100%-1.5rem,32rem)] flex-wrap items-center justify-end gap-x-3 gap-y-1.5 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 shadow-md backdrop-blur-sm pointer-events-none select-none">
      {LEGEND_ITEMS.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5">
          {item.shape === 'circle' ? (
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
          ) : (
            <div
              className="h-2.5 w-2.5 rounded border"
              style={{
                backgroundColor: item.color,
                borderColor: item.border,
              }}
            />
          )}
          <span className="text-xs text-slate-700 whitespace-nowrap">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
};

export default WarehouseMapLegend;
