import { useMemo, useState } from "react";
import { Modal, Button } from "@/components/ui";
import WarehouseMapCanvas from "@/components/shared/WarehouseMapCanvas";
import OutboundStatusTag from "@/components/shared/OutboundStatusTag";
import type { NodeInfo } from "@/types/warehouseMap";
import type { OutboundOrderDetail } from "@/types/outbound";
import {
  buildOutboundLocationOverrides,
  filterOutboundAllocationsByMapNode,
} from "@/utils/outboundMap";
import { formatQuantity } from "@/utils/formatQuantity";

interface OutboundMapModalProps {
  open: boolean;
  onClose: () => void;
  warehouseId: number;
  details: OutboundOrderDetail[];
  orderLabel?: string;
}

function displayLocationName(
  name: string | null | undefined,
  code: string | null | undefined,
  id: number | null | undefined,
): string {
  if (name) return name;
  if (code) return code;
  if (id) return `#${id}`;
  return "—";
}

export default function OutboundMapModal({
  open,
  onClose,
  warehouseId,
  details,
  orderLabel,
}: OutboundMapModalProps) {
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);

  const locationOverrides = useMemo(
    () => buildOutboundLocationOverrides(details),
    [details],
  );

  const selectedEntries = useMemo(() => {
    if (!selectedNode?.content) return [];
    return filterOutboundAllocationsByMapNode(details, selectedNode.content);
  }, [details, selectedNode]);

  const handleClose = () => {
    setSelectedNode(null);
    onClose();
  };

  return (
    <Modal
      title={
        orderLabel
          ? `Bản đồ vị trí lấy hàng — ${orderLabel}`
          : "Bản đồ vị trí lấy hàng"
      }
      open={open}
      onCancel={handleClose}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {locationOverrides.length} vị trí lấy hàng trong đơn — chỉ các kệ này
            được tô màu và hiển thị tồn
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

        {selectedNode && selectedEntries.length > 0 && (
          <>
            <div
              className="absolute inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px]"
              onClick={() => setSelectedNode(null)}
            />
            <div className="absolute top-0 right-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">
                    Vị trí lấy hàng
                  </h3>
                  <p className="text-sm font-medium text-slate-500">
                    {displayLocationName(
                      selectedEntries[0].allocation.from_location_name,
                      selectedEntries[0].allocation.from_location_code,
                      selectedEntries[0].allocation.from_location_id,
                    )}
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
                {selectedEntries.map(({ detail, allocation }) => (
                  <div
                    key={allocation.id}
                    className="rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-start justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h5 className="text-base font-semibold text-slate-800">
                          {allocation.sku || detail.sku || "—"}
                        </h5>
                        <p className="mt-1 text-sm text-slate-500">
                          {allocation.item_name || detail.item_name || "—"}
                        </p>
                      </div>
                      {allocation.status ? (
                        <OutboundStatusTag status={allocation.status} size="sm" />
                      ) : null}
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-slate-400">Lot</dt>
                        <dd className="font-medium text-slate-700">
                          {allocation.lot_number || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Số lượng lấy</dt>
                        <dd className="font-semibold text-brand-primary">
                          {formatQuantity(allocation.quantity)}
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
