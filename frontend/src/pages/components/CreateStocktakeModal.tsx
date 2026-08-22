import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppstoreOutlined, EnvironmentOutlined, ShopOutlined } from "@ant-design/icons";
import { Button, Card, Input, Modal, Select, Space, cn, message } from "@/components/ui";
import { Tag } from "antd";
import WarehouseMapCanvas from "@/components/shared/WarehouseMapCanvas";
import type { NodeInfo } from "@/types/warehouseMap";
import { useCreateStocktake } from "@/hooks/useStocktake";
import { useFullLocations } from "@/hooks/useWarehouseMap";
import { useGetItems } from "@/hooks/useItem";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";
import type { CreateStocktakeInput } from "@/types/stocktake";

type Scope = "warehouse" | "location" | "item";

const SCOPES: {
  key: Scope;
  label: string;
  hint: string;
  icon: ReactNode;
}[] = [
  {
    key: "warehouse",
    label: "Cả kho",
    hint: "Lấy toàn bộ tồn đang hoạt động trong kho đang chọn.",
    icon: <ShopOutlined />,
  },
  {
    key: "location",
    label: "Theo vị trí",
    hint: "Chọn kệ trên bản đồ kho.",
    icon: <EnvironmentOutlined />,
  },
  {
    key: "item",
    label: "Theo mã sản phẩm",
    hint: "Chỉ kiểm kê tồn của các mã đã chọn, có thể lọc thêm theo lô.",
    icon: <AppstoreOutlined />,
  },
];

interface CreateStocktakeModalProps {
  open: boolean;
  warehouseId: number;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function CreateStocktakeModal({
  open,
  warehouseId,
  onCancel,
  onSuccess,
}: CreateStocktakeModalProps) {
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<Scope>("warehouse");
  const [selectedLocationCodes, setSelectedLocationCodes] = useState<string[]>([]);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [itemIds, setItemIds] = useState<number[]>([]);
  const [lotNumbers, setLotNumbers] = useState<string[]>([]);
  const [itemSearch, setItemSearch] = useState("");

  const createMutation = useCreateStocktake();
  const { data: fullLocationsData } = useFullLocations(
    open && warehouseId > 0 ? warehouseId : 0,
  );
  const { data: itemsData, isLoading: isItemsLoading } = useGetItems({
    warehouse_id: warehouseId,
    q: itemSearch || undefined,
    page: 1,
    page_size: 100,
    enabled: open && scope === "item" && warehouseId > 0,
  });

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setScope("warehouse");
    setSelectedLocationCodes([]);
    setIsMapModalOpen(false);
    setItemIds([]);
    setLotNumbers([]);
    setItemSearch("");
  }, [open]);

  const codeToLocationId = useMemo(() => {
    const map = new Map<string, number>();
    for (const loc of fullLocationsData?.locations ?? []) {
      map.set(String(loc.location_code), loc.id);
    }
    return map;
  }, [fullLocationsData]);

  const itemOptions = useMemo(
    () =>
      (itemsData?.items ?? []).map((item) => ({
        value: item.id,
        label: `${item.sku} — ${item.name}`,
      })),
    [itemsData],
  );

  const toggleLocationCode = (code: string) => {
    const normalized = String(code);
    setSelectedLocationCodes((prev) =>
      prev.includes(normalized)
        ? prev.filter((c) => c !== normalized)
        : [...prev, normalized],
    );
  };

  const resolveLocationIds = (codes: string[]): number[] => {
    const ids: number[] = [];
    const missing: string[] = [];
    for (const raw of codes) {
      const code = String(raw);
      const id = codeToLocationId.get(code);
      if (id) ids.push(id);
      else missing.push(code);
    }
    if (missing.length > 0) {
      throw new Error(
        `Không tìm thấy location trong DB (chưa import map hoặc mã không khớp): ${missing.join(", ")}`,
      );
    }
    return ids;
  };

  const handleOk = async () => {
    if (warehouseId <= 0) {
      message.error("Vui lòng chọn kho trước khi tạo sự kiện.");
      return;
    }
    if (scope === "location" && selectedLocationCodes.length === 0) {
      message.error("Vui lòng chọn ít nhất một vị trí trên bản đồ.");
      return;
    }
    if (scope === "item" && itemIds.length === 0) {
      message.error("Vui lòng chọn ít nhất một mã sản phẩm.");
      return;
    }

    const payload: CreateStocktakeInput = {
      warehouse_id: warehouseId,
      description: description.trim() || null,
    };
    if (scope === "location") {
      try {
        payload.location_ids = resolveLocationIds(selectedLocationCodes);
      } catch (err) {
        message.error(err instanceof Error ? err.message : "Lỗi location");
        return;
      }
    }
    if (scope === "item") {
      payload.item_ids = itemIds;
      if (lotNumbers.length > 0) payload.lot_numbers = lotNumbers;
    }

    try {
      await createMutation.mutateAsync(payload);
      message.success("Đã tạo sự kiện kiểm kê.");
      onSuccess();
    } catch (err) {
      message.error(getApiErrorMessage(err, "Không tạo được sự kiện kiểm kê."));
    }
  };

  return (
    <>
      <Modal
        title="Tạo sự kiện kiểm kê"
        open={open}
        onCancel={onCancel}
        onOk={handleOk}
        okText="Tạo sự kiện"
        cancelText="Hủy"
        confirmLoading={createMutation.isPending}
        width={720}
        destroyOnHidden
      >
        <div className="space-y-4 pt-1">
          <div>
            <label className="mb-2 block text-sm font-semibold text-brand-dark">
              Mô tả
            </label>
            <Input
              placeholder="Ví dụ: Kiểm kê định kỳ tháng 8"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-brand-dark">
              Phạm vi kiểm kê
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {SCOPES.map((item) => {
                const active = scope === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setScope(item.key)}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left transition-all",
                      active
                        ? "border-brand-primary bg-brand-primary/5 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    )}
                  >
                    <div
                      className={cn(
                        "mb-1 flex items-center gap-2 text-sm font-semibold",
                        active ? "text-brand-primary" : "text-brand-dark",
                      )}
                    >
                      {item.icon}
                      {item.label}
                    </div>
                    <p className="text-xs leading-snug text-slate-500">
                      {item.hint}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {scope === "warehouse" && (
            <Card className="border-slate-100 bg-slate-50 shadow-none">
              <p className="text-sm font-semibold text-brand-dark">
                Kiểm kê toàn kho
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Hệ thống sẽ tạo checklist từ mọi tồn đang hoạt động trong kho
                hiện tại. Không cần chọn thêm vị trí hay mã sản phẩm.
              </p>
            </Card>
          )}

          {scope === "location" && (
            <Card className="border-slate-100 shadow-none">
              <p className="mb-3 text-sm font-semibold text-brand-dark">
                Chọn vị trí trên bản đồ
              </p>
              <Space orientation="vertical" className="w-full">
                <Space.Compact className="w-full">
                  <Input
                    readOnly
                    value={
                      selectedLocationCodes.length > 0
                        ? `Đã chọn ${selectedLocationCodes.length} điểm`
                        : "Chưa chọn điểm nào"
                    }
                    placeholder="Chọn điểm trên bản đồ..."
                  />
                  <Button
                    variant="primary"
                    icon={<EnvironmentOutlined />}
                    onClick={() => setIsMapModalOpen(true)}
                  >
                    Chọn trên Map
                  </Button>
                </Space.Compact>
                {selectedLocationCodes.length > 0 && (
                  <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                    {selectedLocationCodes.map((code) => (
                      <Tag
                        key={code}
                        closable
                        onClose={() => toggleLocationCode(code)}
                        className="mr-0"
                      >
                        {code}
                      </Tag>
                    ))}
                  </div>
                )}
              </Space>
              <p className="mt-2 text-xs text-slate-400">
                Click kệ trên map để thêm/bỏ. Checklist chỉ gồm tồn tại các ô đã
                chọn.
              </p>
            </Card>
          )}

          {scope === "item" && (
            <Card className="border-slate-100 shadow-none">
              <p className="mb-3 text-sm font-semibold text-brand-dark">
                Chọn mã sản phẩm
              </p>
              <Select
                mode="multiple"
                allowClear
                showSearch
                placeholder="Tìm mã hoặc tên sản phẩm..."
                filterOption={false}
                onSearch={(value) => setItemSearch(value)}
                loading={isItemsLoading}
                value={itemIds}
                onChange={(values) => setItemIds(values as number[])}
                options={itemOptions}
                maxTagCount="responsive"
              />
              <p className="mb-3 mt-4 text-sm font-semibold text-brand-dark">
                Lọc theo lô (tuỳ chọn)
              </p>
              <Select
                mode="tags"
                allowClear
                placeholder="Nhập khoảng lô, Enter để thêm. VD: 10/08/26-22/08/26"
                value={lotNumbers}
                onChange={(values) => setLotNumbers(values as string[])}
                tokenSeparators={[";"]}
              />
              <p className="mt-2 text-xs text-slate-400">
                Để trống nếu kiểm kê mọi lô của các mã đã chọn. Có thể nhập
                `10/08/26, 22/08/26` hoặc `10/08/26-22/08/26`.
              </p>
            </Card>
          )}
        </div>
      </Modal>

      <Modal
        title="Chọn các điểm trên Bản đồ"
        open={isMapModalOpen}
        onCancel={() => setIsMapModalOpen(false)}
        footer={
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              Đã chọn {selectedLocationCodes.length} điểm — click kệ để thêm/bỏ
            </span>
            <Button variant="primary" onClick={() => setIsMapModalOpen(false)}>
              Xác nhận
            </Button>
          </div>
        }
        width="90vw"
        style={{ top: 20 }}
        styles={{ body: { height: "80vh", padding: 0 } }}
        destroyOnHidden
      >
        <div className="h-full w-full">
          <WarehouseMapCanvas
            hideToolbar
            hideDrawer
            selectedLocationCodes={selectedLocationCodes}
            onNodeClick={(node: NodeInfo | null) => {
              if (!node || node.type !== 1 || !node.content) {
                if (node) message.warning("Chỉ chọn được điểm kệ (shelf node).");
                return;
              }
              const code = String(node.content);
              if (!codeToLocationId.has(code)) {
                message.warning(
                  `Mã ${code} chưa có trong DB location. Vui lòng import map trước.`,
                );
                return;
              }
              const isSelected = selectedLocationCodes.includes(code);
              toggleLocationCode(code);
              message.info(
                isSelected ? `Đã bỏ chọn: ${code}` : `Đã chọn: ${code}`,
              );
            }}
          />
        </div>
      </Modal>
    </>
  );
}
