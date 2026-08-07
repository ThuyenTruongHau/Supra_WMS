import React, { useState } from "react";
import {
  Modal,
  Form,
  Input,
  Button,
  Divider,
  Space,
  Typography,
  message,
  Steps,
  DatePicker,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
} from "@ant-design/icons";
import { Table } from "@/components/ui";
import WarehouseMapCanvas from "@/components/shared/WarehouseMapCanvas";
import type { NodeInfo } from "@/types/warehouseMap";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppStore } from "@/store/useAppStore";
import { SkuSearchSelect } from "@/components/shared/SkuSearchSelect";
import {
  useDraftInboundOrder,
  useGetStorageLocationSuggestions,
  useCreateInboundOrder,
} from "@/hooks/useInboundOrder";
import dayjs from "dayjs";

const { Text } = Typography;

interface CreateImportModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  initialData?: PalletGroupForm[];
}

export interface PalletGroupForm {
  key: string;
  sku: string;
  item_name: string;
  lot_code: string;
  expire_at?: string;
  configs: {
    key: string;
    qtyPerPallet: number;
    numPallets: number;
  }[];
  // Extra fields from Excel (optional)
  detail_datetime?: string;
  vehicle_number?: string;
  source_warehouse?: string;
  target_warehouse?: string;
  delivery_type?: string;
  nvt_code?: string;
}

interface ExpandedPallet {
  key: string;
  sku: string;
  item_name: string;
  lot_code: string;
  expire_at?: string;
  quantity: number;
  vehicle_number?: string;
  detail_datetime?: string;
  source_warehouse?: string;
  target_warehouse?: string;
  delivery_type?: string;
  nvt_code?: string;
  suggestedNodeId?: string;
  assignedNodeId?: string;
}

export default function CreateImportModal({
  open,
  onCancel,
  onSuccess,
  initialData,
}: CreateImportModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [notes, setNotes] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);

  const username = useAuthStore((state) => state.username);
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId);

  const draftMutation = useDraftInboundOrder();
  const suggestMutation = useGetStorageLocationSuggestions();
  const createMutation = useCreateInboundOrder();

  const [palletGroups, setPalletGroups] = useState<PalletGroupForm[]>([
    {
      key: "group-1",
      sku: "",
      item_name: "",
      lot_code: "",
      expire_at: undefined,
      configs: [{ key: "config-1", qtyPerPallet: 0, numPallets: 1 }],
    },
  ]);

  React.useEffect(() => {
    if (open) {
      if (initialData && initialData.length > 0) {
        setPalletGroups(initialData);
      } else {
        setPalletGroups([
          {
            key: "group-1",
            sku: "",
            item_name: "",
            lot_code: "",
            expire_at: undefined,
            configs: [{ key: "config-1", qtyPerPallet: 0, numPallets: 1 }],
          },
        ]);
      }
      setCurrentStep(0);
      setSessionId(null);
      setExpandedPallets([]);
      setNotes("");
    }
  }, [open, initialData]);

  const [expandedPallets, setExpandedPallets] = useState<ExpandedPallet[]>([]);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [pickingForPalletKey, setPickingForPalletKey] = useState<string | null>(
    null,
  );

  const handleAddGroup = () => {
    setPalletGroups([
      ...palletGroups,
      {
        key: `group-${Date.now()}`,
        sku: "",
        item_name: "",
        lot_code: "",
        expire_at: undefined,
        configs: [
          { key: `config-${Date.now()}`, qtyPerPallet: 0, numPallets: 1 },
        ],
      },
    ]);
  };

  const handleRemoveGroup = (groupKey: string) => {
    setPalletGroups(palletGroups.filter((g) => g.key !== groupKey));
  };

  const handleAddConfig = (groupIndex: number) => {
    const newGroups = [...palletGroups];
    newGroups[groupIndex].configs.push({
      key: `config-${Date.now()}`,
      qtyPerPallet: 0,
      numPallets: 1,
    });
    setPalletGroups(newGroups);
  };

  const handleRemoveConfig = (groupIndex: number, configKey: string) => {
    const newGroups = [...palletGroups];
    newGroups[groupIndex].configs = newGroups[groupIndex].configs.filter(
      (c) => c.key !== configKey,
    );
    setPalletGroups(newGroups);
  };

  const handleUpdateConfig = (
    groupIndex: number,
    configIndex: number,
    field: "qtyPerPallet" | "numPallets",
    value: number,
  ) => {
    const newGroups = [...palletGroups];
    newGroups[groupIndex].configs[configIndex][field] = value;
    setPalletGroups(newGroups);
  };

  const handleNext = async () => {
    const hasFull = palletGroups.some((g) => !g.sku || !g.lot_code);
    if (hasFull) {
      message.error("Vui lòng điền đầy đủ Part_number và Mã lô!");
      return;
    }

    let hasZeroConfig = false;
    const expanded: ExpandedPallet[] = [];
    palletGroups.forEach((group) => {
      group.configs.forEach((config) => {
        if (config.qtyPerPallet <= 0 || config.numPallets <= 0) {
          hasZeroConfig = true;
        }
        for (let i = 0; i < config.numPallets; i++) {
          expanded.push({
            key: `expanded-${group.key}-${config.key}-${i}`,
            sku: group.sku,
            item_name: group.item_name,
            lot_code: group.lot_code,
            expire_at: group.expire_at,
            quantity: config.qtyPerPallet,
            vehicle_number: group.vehicle_number,
            detail_datetime: group.detail_datetime,
            source_warehouse: group.source_warehouse,
            target_warehouse: group.target_warehouse,
            delivery_type: group.delivery_type,
            nvt_code: group.nvt_code,
          });
        }
      });
    });

    if (hasZeroConfig) {
      message.error(
        "Vui lòng điền số lượng Pallet và số lượng trên mỗi Pallet lớn hơn 0!",
      );
      return;
    }

    try {
      const draftPayload = {
        supplier_name: username || "Unknown",
        notes: notes,
        details: expanded.map((p) => ({
          sku: p.sku,
          item_name: p.item_name,
          item_lot_code: p.lot_code,
          item_expire_at: p.expire_at ? p.expire_at : undefined,
          ordered_quantity: p.quantity,
          vehicle_number: p.vehicle_number,
          detail_datetime: p.detail_datetime,
          source_warehouse: p.source_warehouse,
          target_warehouse: p.target_warehouse,
          delivery_type: p.delivery_type,
          nvt_code: p.nvt_code,
          status: "in_progress",
        })),
      };
      console.log(
        "=== [1] POST /api/v1/inbound-orders/draft PAYLOAD ===",
        draftPayload,
      );

      message.loading({ content: "Đang gửi bản nháp...", key: "draft" });
      const draftRes = await draftMutation.mutateAsync(draftPayload);

      const sessId = draftRes.session_id;
      setSessionId(sessId);

      console.log(
        "=== [2] GET /api/v1/inbound-orders/storage-locations-suggest PARAMS ===",
        { session_id: sessId },
      );
      message.loading({ content: "Đang lấy gợi ý vị trí...", key: "draft" });
      const suggestRes = await suggestMutation.mutateAsync(sessId);

      // Map suggestions to expanded pallets
      const mappedExpanded = expanded.map((p, index) => {
        const suggestion = suggestRes.suggestions[index];
        return {
          ...p,
          suggestedNodeId: suggestion ? suggestion.location_code : undefined,
        };
      });

      setExpandedPallets(mappedExpanded);
      message.success({ content: "Lấy gợi ý thành công!", key: "draft" });
      setCurrentStep(1);
    } catch (error: any) {
      console.error("API Error:", error);
      const errorMsg =
        error?.response?.data?.message ||
        error?.response?.data?.detail ||
        "Có lỗi xảy ra khi gọi API";
      message.error({ content: errorMsg, key: "draft" });
    }
  };

  const handleMapNodeClick = (node: NodeInfo | null) => {
    if (!node || node.type !== 1) {
      message.warning("Vui lòng chọn vào một Kệ (Shelf) hợp lệ!");
      return;
    }

    const isDuplicate = expandedPallets.some(
      (p) =>
        p.key !== pickingForPalletKey &&
        (p.assignedNodeId === node.name ||
          (!p.assignedNodeId && p.suggestedNodeId === node.name)),
    );

    if (isDuplicate) {
      message.error(
        `Kệ ${node.name} đã được phân bổ cho pallet khác trong đơn này!`,
      );
      return;
    }

    setExpandedPallets((prev) =>
      prev.map((p) => {
        if (p.key === pickingForPalletKey) {
          return { ...p, assignedNodeId: node.name };
        }
        return p;
      }),
    );

    message.success(`Đã gán Kệ ${node.name}`);
    setIsMapModalOpen(false);
  };

  const handleSave = async () => {
    const usedNodes = new Set();
    let hasDuplicate = false;
    let hasMissingLocation = false;

    expandedPallets.forEach((p) => {
      const nodeId = p.assignedNodeId || p.suggestedNodeId;
      if (!nodeId) {
        hasMissingLocation = true;
      } else {
        if (usedNodes.has(nodeId)) hasDuplicate = true;
        usedNodes.add(nodeId);
      }
    });

    if (hasDuplicate) {
      message.error(
        "Có vị trí kệ bị trùng lặp giữa các pallet. Vui lòng kiểm tra lại!",
      );
      return;
    }

    if (hasMissingLocation) {
      message.error("Có pallet chưa được gán vị trí!");
      return;
    }

    if (!sessionId) return;

    try {
      const createPayload = {
        supplier_name: username || "Unknown",
        notes: notes,
        details: expandedPallets.map((p) => ({
          sku: p.sku,
          item_name: p.item_name,
          item_lot_code: p.lot_code,
          item_expire_at: p.expire_at,
          ordered_quantity: p.quantity,
          vehicle_number: p.vehicle_number,
          detail_datetime: p.detail_datetime,
          source_warehouse: p.source_warehouse,
          target_warehouse: p.target_warehouse,
          delivery_type: p.delivery_type,
          nvt_code: p.nvt_code,
          status: "in_progress",
          location_code: (p.assignedNodeId || p.suggestedNodeId) as string,
        })),
      };
      console.log(
        "=== [3] POST /api/v1/inbound-orders PAYLOAD ===\n",
        "Params:",
        { session_id: sessionId },
        "\n Body:",
        createPayload,
      );

      message.loading({ content: "Đang tạo đơn nhập...", key: "create" });
      await createMutation.mutateAsync({
        sessionId,
        data: createPayload,
      });
      message.success({ content: "Tạo đơn nhập thành công!", key: "create" });

      // Reset state
      setNotes("");
      setSessionId(null);
      setPalletGroups([
        {
          key: "group-1",
          sku: "",
          item_name: "",
          lot_code: "",
          expire_at: "",
          configs: [{ key: "config-1", qtyPerPallet: 0, numPallets: 1 }],
        },
      ]);
      setCurrentStep(0);
      onSuccess();
    } catch (error) {
      message.error({ content: "Có lỗi xảy ra khi tạo đơn", key: "create" });
    }
  };

  const step2Columns = [
    { title: "Part_number", dataIndex: "sku", key: "sku" },
    { title: "Lot Code", dataIndex: "lot_code", key: "lot_code" },
    { title: "Số lượng", dataIndex: "quantity", key: "quantity" },
    {
      title: "Vị trí gán",
      key: "location",
      render: (_: any, record: ExpandedPallet) => (
        <Space>
          <Text
            strong
            className={
              record.assignedNodeId ? "text-brand-primary" : "text-slate-600"
            }
          >
            {record.assignedNodeId || record.suggestedNodeId}
          </Text>
          <Button
            type="text"
            icon={
              <EnvironmentOutlined
                className={
                  record.assignedNodeId
                    ? "text-brand-primary"
                    : "text-slate-400"
                }
              />
            }
            onClick={() => {
              setPickingForPalletKey(record.key);
              setIsMapModalOpen(true);
            }}
          />
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={
          <span className="text-xl font-bold text-brand-dark">
            Tạo Phiếu Nhập Kho Mới
          </span>
        }
        open={open}
        onCancel={onCancel}
        width={900}
        footer={
          <div className="flex justify-between items-center w-full">
            {currentStep === 0 ? (
              <div />
            ) : (
              <Button onClick={() => setCurrentStep(0)}>Quay lại</Button>
            )}

            <Space>
              <Button onClick={onCancel}>Hủy</Button>
              {currentStep === 0 ? (
                <Button
                  type="primary"
                  onClick={handleNext}
                  className="bg-brand-primary"
                  loading={draftMutation.isPending || suggestMutation.isPending}
                >
                  Tiếp tục (Phân bổ Vị trí)
                </Button>
              ) : (
                <Button
                  type="primary"
                  onClick={handleSave}
                  className="bg-brand-primary"
                  loading={createMutation.isPending}
                >
                  Xác nhận Tạo Đơn
                </Button>
              )}
            </Space>
          </div>
        }
      >
        <Steps
          current={currentStep}
          className="mb-8 mt-4"
          items={[{ title: "Khai báo hàng hóa" }, { title: "Phân bổ vị trí" }]}
        />

        {currentStep === 0 && (
          <div className="space-y-6">
            <Form layout="vertical">
              <Form.Item label="Ghi chú (Tùy chọn)" className="mb-0">
                <Input.TextArea
                  placeholder="Nhập ghi chú cho đơn nhập này..."
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Form.Item>
            </Form>

            <Divider
              titlePlacement="left"
              className="!text-sm text-slate-400 mt-0"
            >
              DANH SÁCH PALLET
            </Divider>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
              {palletGroups.map((group, groupIndex) => (
                <div
                  key={group.key}
                  className="p-4 bg-slate-50 border border-stripe-hairline rounded-lg relative"
                >
                  {palletGroups.length > 1 && (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      className="absolute top-2 right-2 z-10"
                      onClick={() => handleRemoveGroup(group.key)}
                    />
                  )}

                  <div className="grid grid-cols-3 gap-4 mb-4 mt-2">
                    <div className="min-w-0">
                      <SkuSearchSelect
                        warehouseId={selectedWarehouseId || 0}
                        value={group.sku || undefined}
                        onChange={(sku) => {
                          const newGroups = [...palletGroups];
                          newGroups[groupIndex].sku = sku || "";
                          if (!sku) {
                            newGroups[groupIndex].item_name = "";
                          }
                          setPalletGroups(newGroups);
                        }}
                        onSelectOption={(opt) => {
                          const newGroups = [...palletGroups];
                          newGroups[groupIndex].sku = opt?.value || "";
                          newGroups[groupIndex].item_name =
                            opt?.item_name || "";
                          setPalletGroups(newGroups);
                        }}
                      />
                    </div>
                    <Input
                      placeholder="Nhập Lot Code..."
                      value={group.lot_code}
                      onChange={(e) => {
                        const newGroups = [...palletGroups];
                        newGroups[groupIndex].lot_code = e.target.value;
                        setPalletGroups(newGroups);
                      }}
                    />
                    <DatePicker
                      placeholder="Hạn sử dụng"
                      format="DD/MM/YYYY"
                      value={group.expire_at ? dayjs(group.expire_at) : null}
                      onChange={(date) => {
                        const newGroups = [...palletGroups];
                        newGroups[groupIndex].expire_at = date
                          ? date.toISOString()
                          : undefined;
                        setPalletGroups(newGroups);
                      }}
                      className="w-full"
                    />
                    <DatePicker
                      placeholder="Ngày/ Giờ chi tiết"
                      showTime
                      format="DD/MM/YYYY HH:mm"
                      value={
                        group.detail_datetime
                          ? dayjs(group.detail_datetime)
                          : null
                      }
                      onChange={(date) => {
                        const newGroups = [...palletGroups];
                        newGroups[groupIndex].detail_datetime = date
                          ? date.toISOString()
                          : "";
                        setPalletGroups(newGroups);
                      }}
                      className="w-full"
                    />
                    <Input
                      placeholder="Số xe"
                      value={group.vehicle_number || ""}
                      onChange={(e) => {
                        const newGroups = [...palletGroups];
                        newGroups[groupIndex].vehicle_number = e.target.value;
                        setPalletGroups(newGroups);
                      }}
                    />
                    <Input
                      placeholder="Kho xuất"
                      value={group.source_warehouse || ""}
                      onChange={(e) => {
                        const newGroups = [...palletGroups];
                        newGroups[groupIndex].source_warehouse = e.target.value;
                        setPalletGroups(newGroups);
                      }}
                    />
                    <Input
                      placeholder="Kho nhập"
                      value={group.target_warehouse || ""}
                      onChange={(e) => {
                        const newGroups = [...palletGroups];
                        newGroups[groupIndex].target_warehouse = e.target.value;
                        setPalletGroups(newGroups);
                      }}
                    />
                    <Input
                      placeholder="Delivery"
                      value={group.delivery_type || ""}
                      onChange={(e) => {
                        const newGroups = [...palletGroups];
                        newGroups[groupIndex].delivery_type = e.target.value;
                        setPalletGroups(newGroups);
                      }}
                    />
                    <Input
                      placeholder="NVT"
                      value={group.nvt_code || ""}
                      onChange={(e) => {
                        const newGroups = [...palletGroups];
                        newGroups[groupIndex].nvt_code = e.target.value;
                        setPalletGroups(newGroups);
                      }}
                    />
                  </div>

                  <div className="space-y-2 pl-4 border-l-2 border-brand-primary/20">
                    {group.configs.map((config, configIndex) => (
                      <div key={config.key} className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            value={config.qtyPerPallet}
                            onChange={(e) =>
                              handleUpdateConfig(
                                groupIndex,
                                configIndex,
                                "qtyPerPallet",
                                parseInt(e.target.value) || 0,
                              )
                            }
                            prefix={
                              <span className="text-slate-400 text-xs">
                                SL/Pallet:
                              </span>
                            }
                          />
                          <span className="text-slate-400 font-bold">×</span>
                          <Input
                            type="number"
                            min={1}
                            value={config.numPallets}
                            onChange={(e) =>
                              handleUpdateConfig(
                                groupIndex,
                                configIndex,
                                "numPallets",
                                parseInt(e.target.value) || 0,
                              )
                            }
                            prefix={
                              <span className="text-slate-400 text-xs">
                                Số Pallet:
                              </span>
                            }
                          />
                        </div>

                        {group.configs.length > 1 && (
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() =>
                              handleRemoveConfig(groupIndex, config.key)
                            }
                          />
                        )}
                      </div>
                    ))}

                    <Button
                      type="dashed"
                      icon={<PlusOutlined />}
                      className="w-full mt-2 text-brand-primary border-brand-primary/30 hover:!text-brand-primary hover:!border-brand-primary"
                      onClick={() => handleAddConfig(groupIndex)}
                    >
                      Thêm pallet cùng Part_number với số lượng khác
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                type="dashed"
                icon={<PlusOutlined />}
                className="w-full h-12 text-brand-dark"
                onClick={handleAddGroup}
              >
                Thêm nhóm Part_number mới
              </Button>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-4 max-h-[50vh] overflow-y-auto custom-scrollbar">
            <div className="bg-brand-primary/10 p-3 rounded-lg border border-brand-primary/20 text-sm text-brand-dark">
              Hệ thống đã tự động tách thành{" "}
              <strong>{expandedPallets.length}</strong> pallet vật lý độc lập và
              gọi API gợi ý vị trí. Bạn có thể bấm vào icon bản đồ để sửa lại vị
              trí kệ theo ý muốn.
            </div>

            <Table
              columns={step2Columns}
              dataSource={expandedPallets}
              pagination={false}
              size="small"
              className="border border-stripe-hairline rounded-lg"
            />
          </div>
        )}
      </Modal>

      <Modal
        title="Chọn Vị trí Kệ (Click vào Kệ trống)"
        open={isMapModalOpen}
        onCancel={() => setIsMapModalOpen(false)}
        footer={null}
        width="90vw"
        style={{ top: 20 }}
        styles={{ body: { height: "80vh", padding: 0, position: "relative" } }}
      >
        <div className="absolute inset-0 bg-slate-100 rounded-b-lg overflow-hidden">
          {isMapModalOpen && (
            <WarehouseMapCanvas
              hideToolbar
              hideDrawer
              onNodeClick={handleMapNodeClick}
            />
          )}
        </div>
      </Modal>
    </>
  );
}
