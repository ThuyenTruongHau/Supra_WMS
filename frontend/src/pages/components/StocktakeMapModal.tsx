import { useMemo, useState } from "react";
import { Modal, Button } from "@/components/ui";
import WarehouseMapCanvas from "@/components/shared/WarehouseMapCanvas";
import InboundStatusTag from "@/components/shared/InboundStatusTag";
import type { NodeInfo } from "@/types/warehouseMap";
import type { StocktakeItemStock } from "@/types/stocktake";
import {
  buildStocktakeLocationOverrides,
  filterStocktakeItemsByMapNode,
} from "@/utils/stocktakeMap";
import { formatQuantity } from "@/utils/formatQuantity";

interface StocktakeMapModalProps {
  open: boolean;
  onClose: () => void;
  warehouseId: number;
  items: StocktakeItemStock[];
  stocktakeLabel?: string;
}

function displayLocationName(record: StocktakeItemStock): string {
  return (
    record.location_name ||
    (record.location_id ? `#${record.location_id}` : "—")
  );
}

export default function StocktakeMapModal({
  open,
  onClose,
  warehouseId,
  items,
  stocktakeLabel,
}: StocktakeMapModalProps) {
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);

  const locationOverrides = useMemo(
    () => buildStocktakeLocationOverrides(items),
    [items],
  );

  const selectedItems = useMemo(() => {
    if (!selectedNode?.content) return [];
    return filterStocktakeItemsByMapNode(items, selectedNode.content);
  }, [items, selectedNode]);

  const handleClose = () => {
    setSelectedNode(null);
    onClose();
  };

  return (
    <Modal
      title={
        stocktakeLabel
          ? `Bản đồ kiểm kê — ${stocktakeLabel}`
          : "Bản đồ kiểm kê"
      }
      open={open}
      onCancel={handleClose}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {locationOverrides.length} vị trí trong phiếu — chỉ các kệ này được
            tô màu và hiển thị tồn
          </span>
          <Button variant="primary" onClick={handleClose}>
            Đóng
          </Button>
        </div>
      }
      width="90vw"
      style={{ top: 20 }}
      styles={{ body: { height: "80vh", padding: 0 } }}
      destroyOnHidden
    >
      <div className="relative h-full w-full">
        <WarehouseMapCanvas
          warehouseId={warehouseId}
          hideToolbar
          hideDrawer
          skipFullLocationsFetch
          locationOverrides={locationOverrides}
          onNodeClick={(node) => {
            if (node?.type === 1) {
              setSelectedNode(node);
            } else {
              setSelectedNode(null);
            }
          }}
        />

        {selectedNode && selectedItems.length > 0 && (
          <>
            <div
              className="absolute inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px]"
              onClick={() => setSelectedNode(null)}
            />
            <div className="absolute top-0 right-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">
                    Vị trí kiểm kê
                  </h3>
                  <p className="text-sm font-medium text-slate-500">
                    {displayLocationName(selectedItems[0])}
                  </p>
                </div>
                <Button
                  variant="text"
                  onClick={() => setSelectedNode(null)}
                  className="!h-10 !w-10 !rounded-full !p-2"
                >
                  ×
                </Button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {selectedItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-start justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h5 className="text-base font-semibold text-slate-800">
                          {item.item_sku || "—"}
                        </h5>
                        <p className="mt-1 text-sm text-slate-500">
                          {item.item_name || "—"}
                        </p>
                      </div>
                      {item.status ? (
                        <InboundStatusTag status={item.status} size="sm" />
                      ) : null}
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-slate-400">Lot</dt>
                        <dd className="font-medium text-slate-700">
                          {item.lot_number || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">SL hệ thống</dt>
                        <dd className="font-semibold text-slate-800">
                          {formatQuantity(item.desired_quantity)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">SL thực tế</dt>
                        <dd className="font-semibold text-brand-primary">
                          {formatQuantity(item.actual_quantity)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
