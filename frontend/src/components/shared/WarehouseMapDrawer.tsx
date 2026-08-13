import React from 'react';
import { useLocationDetail } from '@/hooks/useWarehouseMap';
import { Loading, Alert, Button } from '@/components/ui';
import { cn } from '@/components/ui/utils/cn';
import { formatQuantity } from '@/utils/formatQuantity';

interface NodeInfo {
  x: number;
  y: number;
  type: number;
  content: string;
  name: string;
}

interface WarehouseMapDrawerProps {
  visible: boolean;
  onClose: () => void;
  node: NodeInfo | null;
  locationId?: number;
}

const WarehouseMapDrawer: React.FC<WarehouseMapDrawerProps> = ({
  visible,
  onClose,
  node,
  locationId,
}) => {
  const { data: detailData, isLoading, isError } = useLocationDetail(
    node?.type === 1 ? locationId : undefined,
  );

  const hasItem = detailData && detailData.summary.item_stock_count > 0;
  return (
    <>
      {visible && (
        <div
          className="absolute inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px] transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={cn(
          "absolute top-0 right-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 transform transition-transform duration-300 ease-in-out flex flex-col",
          visible ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              {node?.type === 1 ? 'Thông tin Kệ hàng' : 'Thông tin Waypoint'}
            </h3>
            <p className="text-sm text-slate-500 font-medium">
              Node:{' '}
              <span className="font-mono text-primary-600">{node?.content}</span>
            </p>
          </div>
          <Button
            variant="text"
            onClick={onClose}
            className="!p-2 !w-10 !h-10 !rounded-full !text-slate-500 hover:!bg-slate-200 hover:!text-slate-700 flex items-center justify-center"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full p-6">
              <Loading text="Đang tải thông tin..." className="!h-auto" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-full p-6">
              <Alert variant="error" className="w-full text-center">
                Không thể tải thông tin chi tiết.
              </Alert>
            </div>
          ) : detailData ? (
            <div className="space-y-6">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Vị trí (Location)
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="block text-xs text-slate-500">Warehouse</span>
                    <span className="font-semibold text-slate-700">
                      {detailData.location.warehouse_id}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500">Mã kệ</span>
                    <span className="font-semibold text-slate-700">
                      {detailData.location.location_name}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500">Row / Col / Level</span>
                    <span className="font-semibold text-slate-700">
                      {detailData.location.row || '-'} /{' '}
                      {detailData.location.column || '-'} /{' '}
                      {detailData.location.level || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500">Tọa độ Bản đồ</span>
                    <span className="font-mono text-sm text-slate-700">
                      ({node?.x}, {node?.y})
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Thông tin Sản phẩm
                </h4>

                {hasItem ? (
                  <div className="space-y-3">
                    {detailData.item_stock.map((stock) => (
                      <div
                        key={stock.id}
                        className="p-4 bg-white border border-emerald-200 bg-emerald-50/30 rounded-xl shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-3 pb-3 border-b border-slate-100">
                          <div>
                            <h5 className="font-semibold text-slate-800 text-base">
                              {stock.sku}
                            </h5>
                            <span className="text-sm font-mono text-slate-500 mt-1 block">
                              Tình trạng: {stock.status}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="block font-bold text-emerald-600 text-lg">
                              {formatQuantity(stock.quantity)}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-y-3 text-sm">
                          <div>
                            <span className="block text-xs text-slate-400 mb-0.5">
                              Lot Number
                            </span>
                            <span className="font-medium text-slate-700">
                              {stock.lot_number || '-'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-xs text-slate-400 mb-0.5">
                              Hạn sử dụng
                            </span>
                            <span className="font-medium text-slate-700">
                              {stock.expiry_date || '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                    <p className="text-sm font-medium text-slate-500">
                      Kệ này hiện đang trống
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
              <p className="text-sm font-medium text-slate-600">
                Không tìm thấy thông tin chi tiết cho Node này.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default WarehouseMapDrawer;
