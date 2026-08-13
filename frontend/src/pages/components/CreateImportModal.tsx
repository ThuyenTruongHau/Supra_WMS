import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Form,
  Input,
  Button as AntButton,
  Divider,
  Space,
  Steps,
  DatePicker,
  Tag,
  message,
} from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { Select, Table, Button } from "@/components/ui";
import { SkuSearchSelect } from "@/components/shared/SkuSearchSelect";
import { useAppStore } from "@/store/useAppStore";
import {
  useSuggestInboundAllocation,
  useReleaseInboundLocations,
  useCreateInboundOrder,
  useUpdateInboundOrder,
} from "@/hooks/useInboundOrder";
import type {
  InboundOrderAllocationUpdate,
  InboundOrderDetailUpdate,
  InboundSuggestAllocationGroupResponse,
} from "@/types/inboundOrder";
import { useUnits } from "@/hooks/useUnit";
import { useInboundBufferLocations } from "@/hooks/useWarehouseMap";
import {
  convertQuantityApi,
  getItemAvailableUnitsApi,
} from "@/api/itemUnit";
import { formatQuantity } from "@/utils/formatQuantity";
import dayjs from "dayjs";
import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/apiError";

/** Một SKU trong nhóm. */
export interface ImportItemDraft {
  key: string;
  allocation_id?: number;
  sku?: string;
  item_id?: number;
  item_name?: string;
  quantity: number;
  unit_id?: number;
  unit_options?: { value: number; label: string }[];
  converted_quantity?: number;
  converted_unit_name?: string;
  lot_number?: string;
  expiry_date?: string;
}

/** Một nhóm/pallet — nhiều SKU dùng chung một vị trí đích. */
export interface ImportGroupDraft {
  key: string;
  detail_id?: number;
  from_location_id?: number;
  to_location_id?: number;
  to_location_name?: string;
  status?: string;
  items: ImportItemDraft[];
}

interface CreateImportModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  mode?: "create" | "edit";
  editOrderCode?: string;
  initialNote?: string;
  initialGroups?: ImportGroupDraft[];
}

let draftSeq = 0;
const nextKey = (prefix: string) => `${prefix}-${Date.now()}-${draftSeq++}`;

export const createEmptyItem = (): ImportItemDraft => ({
  key: nextKey("item"),
  quantity: 1,
});

export const createEmptyGroup = (): ImportGroupDraft => ({
  key: nextKey("group"),
  items: [createEmptyItem()],
});

function errorMessage(err: unknown): string {
  const ax = err as AxiosError<ApiErrorResponse>;
  const detail = ax?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (err instanceof Error) return err.message;
  return "Có lỗi xảy ra";
}

export default function CreateImportModal({
  open,
  onCancel,
  onSuccess,
  mode = "create",
  editOrderCode,
  initialNote,
  initialGroups,
}: CreateImportModalProps) {
  const isEdit = mode === "edit";
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);
  const inboundType = useAppStore((s) => s.inboundType);

  const [step, setStep] = useState(0);
  const [orderCode, setOrderCode] = useState("");
  const [note, setNote] = useState("");
  const [groups, setGroups] = useState<ImportGroupDraft[]>([createEmptyGroup()]);
  const [originalGroups, setOriginalGroups] = useState<ImportGroupDraft[]>([]);
  const [suggested, setSuggested] = useState<
    InboundSuggestAllocationGroupResponse[]
  >([]);

  const { data: units = [] } = useUnits();
  const {
    data: bufferLocationsData,
    isLoading: bufferLocationsLoading,
    isError: bufferLocationsError,
    refetch: refetchBufferLocations,
  } = useInboundBufferLocations(selectedWarehouseId || 0, open);

  const bufferLocationOptions = useMemo(
    () =>
      (bufferLocationsData?.items ?? []).map((loc) => ({
        value: loc.id,
        label: `${loc.location_code}${loc.location_name ? ` — ${loc.location_name}` : ""}`,
      })),
    [bufferLocationsData],
  );

  const unitOptions = useMemo(
    () => units.map((u) => ({ value: u.id, label: u.name })),
    [units],
  );

  const suggestMutation = useSuggestInboundAllocation();
  const releaseMutation = useReleaseInboundLocations();
  const createMutation = useCreateInboundOrder();
  const updateMutation = useUpdateInboundOrder();

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSuggested([]);
    const seed =
      initialGroups && initialGroups.length > 0
        ? initialGroups
        : [createEmptyGroup()];
    setGroups(seed);
    if (isEdit) {
      setOrderCode(editOrderCode ?? "");
      setNote(initialNote ?? "");
      setOriginalGroups(seed);
    } else {
      setOrderCode(`IN-${dayjs().format("YYYYMMDD-HHmmss")}`);
      setNote("");
      setOriginalGroups([]);
    }
  }, [open, isEdit, editOrderCode, initialNote, initialGroups]);

  const releaseSuggestedLocations = async () => {
    const ids = suggested
      .map((s) => s.target_location_id)
      .filter((id): id is number => !!id);
    if (ids.length === 0) return;
    try {
      await releaseMutation.mutateAsync({ location_ids: ids });
    } catch {
      // best-effort release
    }
  };

  const handleClose = async () => {
    if (!isEdit && step === 1) await releaseSuggestedLocations();
    onCancel();
  };

  const updateGroup = (groupKey: string, patch: Partial<ImportGroupDraft>) => {
    setGroups((prev) =>
      prev.map((g) => (g.key === groupKey ? { ...g, ...patch } : g)),
    );
  };

  const updateItem = (
    groupKey: string,
    itemKey: string,
    patch: Partial<ImportItemDraft>,
  ) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.key === groupKey
          ? {
              ...g,
              items: g.items.map((i) =>
                i.key === itemKey ? { ...i, ...patch } : i,
              ),
            }
          : g,
      ),
    );
  };

  const refreshConvertedQuantity = async (
    groupKey: string,
    itemKey: string,
    itemId: number,
    unitId: number,
    quantity: number,
  ) => {
    if (!itemId || !unitId || quantity <= 0) {
      updateItem(groupKey, itemKey, {
        converted_quantity: undefined,
        converted_unit_name: undefined,
      });
      return;
    }
    try {
      const converted = await convertQuantityApi({
        item_id: itemId,
        unit_id: unitId,
        quantity,
      });
      updateItem(groupKey, itemKey, {
        converted_quantity: Number(converted.converted_quantity),
        converted_unit_name: converted.base_unit_name,
      });
    } catch (err) {
      updateItem(groupKey, itemKey, {
        converted_quantity: undefined,
        converted_unit_name: undefined,
      });
      message.error(errorMessage(err));
    }
  };

  const loadItemUnits = async (groupKey: string, itemKey: string, itemId: number) => {
    const available = await getItemAvailableUnitsApi(itemId);
    updateItem(groupKey, itemKey, {
      unit_options: available.units.map((u) => ({
        value: u.unit_id,
        label: u.unit_name,
      })),
    });
    return available;
  };

  const handleAddGroup = () => {
    if (isEdit) return;
    setGroups((prev) => [...prev, createEmptyGroup()]);
  };

  const handleRemoveGroup = (groupKey: string) => {
    setGroups((prev) => prev.filter((g) => g.key !== groupKey));
  };

  const handleAddItem = (groupKey: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.key === groupKey ? { ...g, items: [...g.items, createEmptyItem()] } : g,
      ),
    );
  };

  const handleRemoveItem = (groupKey: string, itemKey: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.key === groupKey
          ? { ...g, items: g.items.filter((i) => i.key !== itemKey) }
          : g,
      ),
    );
  };

  const validateStep0 = () => {
    if (!selectedWarehouseId) {
      message.error("Vui lòng chọn kho");
      return false;
    }
    if (!orderCode.trim()) {
      message.error("Vui lòng nhập mã đơn");
      return false;
    }
    if (groups.length === 0) {
      message.error("Cần ít nhất một nhóm hàng");
      return false;
    }
    for (const [index, group] of groups.entries()) {
      if (isEdit && !group.from_location_id) {
        message.error(`Nhóm ${index + 1}: cần chọn điểm cấp`);
        return false;
      }
      if (group.items.length === 0) {
        message.error(`Nhóm ${index + 1}: cần ít nhất một SKU`);
        return false;
      }
      for (const item of group.items) {
        if (!item.item_id || !item.unit_id || !item.quantity || item.quantity <= 0) {
          message.error(`Nhóm ${index + 1}: mỗi SKU cần Item, Unit và SL > 0`);
          return false;
        }
      }
    }
    return true;
  };

  const validateStep1 = () => {
    for (const [index, group] of groups.entries()) {
      if (!group.to_location_id) {
        message.error(`Nhóm ${index + 1}: thiếu vị trí đích`);
        return false;
      }
      if (!group.from_location_id) {
        message.error(`Nhóm ${index + 1}: cần chọn điểm cấp`);
        return false;
      }
    }
    return true;
  };

  const handleContinue = async () => {
    if (!validateStep0()) return;

    try {
      message.loading({ content: "Đang gợi ý vị trí...", key: "suggest" });
      const res = await suggestMutation.mutateAsync({
        warehouse_id: selectedWarehouseId,
        detail_type: inboundType,
        line_items: groups.map((g) => ({
          items: g.items.map((i) => ({
            item_id: i.item_id!,
            quantity: i.quantity,
            unit_id: i.unit_id!,
            lot_number: i.lot_number?.trim() || null,
          })),
          details: {
            items: g.items.map((i) => ({
              sku: i.sku,
              item_name: i.item_name,
              lot_number: i.lot_number?.trim() || null,
              expiry_date: i.expiry_date || null,
            })),
          },
        })),
      });
      setSuggested(res.line_items);
      setGroups((prev) =>
        prev.map((g, idx) => ({
          ...g,
          to_location_id: res.line_items[idx]?.target_location_id,
          to_location_name: res.line_items[idx]?.target_location_name,
        })),
      );
      message.success({ content: "Đã gợi ý vị trí đích", key: "suggest" });
      setStep(1);
      void refetchBufferLocations();
    } catch (err) {
      message.error({ content: errorMessage(err), key: "suggest" });
    }
  };

  const buildUpdatePayload = (): InboundOrderDetailUpdate[] => {
    const currentDetailIds = new Set(
      groups.map((g) => g.detail_id).filter((id): id is number => !!id),
    );
    const deletedGroups: InboundOrderDetailUpdate[] = originalGroups
      .map((g) => g.detail_id)
      .filter((id): id is number => !!id && !currentDetailIds.has(id))
      .map((id) => ({ id, delete: true }));

    const originalGroupByDetailId = new Map(
      originalGroups
        .filter((g) => g.detail_id)
        .map((g) => [g.detail_id!, g] as const),
    );

    const updatedGroups: InboundOrderDetailUpdate[] = groups
      .filter((g) => g.detail_id)
      .map((g) => {
        const original = originalGroupByDetailId.get(g.detail_id!);
        const currentAllocationIds = new Set(
          g.items
            .map((i) => i.allocation_id)
            .filter((id): id is number => !!id),
        );
        const deletedAllocations: InboundOrderAllocationUpdate[] = (
          original?.items ?? []
        )
          .map((i) => i.allocation_id)
          .filter(
            (id): id is number => !!id && !currentAllocationIds.has(id),
          )
          .map((id) => ({ id, delete: true }));

        const upsertAllocations: InboundOrderAllocationUpdate[] = g.items.map(
          (i) => ({
            ...(i.allocation_id ? { id: i.allocation_id } : {}),
            item_id: i.item_id,
            quantity: i.quantity,
            unit_id: i.unit_id,
            lot_number: i.lot_number?.trim() || null,
            expiry_date: i.expiry_date || null,
          }),
        );

        return {
          id: g.detail_id!,
          ...(g.from_location_id
            ? { from_location_id: g.from_location_id }
            : {}),
          allocations: [...deletedAllocations, ...upsertAllocations],
        };
      });

    return [...deletedGroups, ...updatedGroups];
  };

  const handleSubmit = async () => {
    if (!selectedWarehouseId) return;

    if (isEdit) {
      if (!validateStep0() || !editOrderCode) return;

      try {
        message.loading({ content: "Đang cập nhật đơn nhập...", key: "submit" });
        await updateMutation.mutateAsync({
          orderCode: editOrderCode,
          inboundType,
          data: {
            note: note.trim() || null,
            line_items: buildUpdatePayload(),
          },
        });
        message.success({
          content: "Cập nhật đơn nhập thành công!",
          key: "submit",
        });
        onSuccess();
      } catch (err) {
        message.error({ content: errorMessage(err), key: "submit" });
      }
      return;
    }

    for (const group of groups) {
      if (!group.to_location_id) {
        message.error("Mỗi nhóm cần có vị trí đích (To location)");
        return;
      }
    }

    if (!validateStep1()) return;

    try {
      message.loading({ content: "Đang tạo đơn nhập...", key: "submit" });
      await createMutation.mutateAsync({
        inboundType,
        data: {
          order_code: orderCode.trim(),
          note: note.trim() || null,
          warehouse_id: selectedWarehouseId,
          details: {},
          line_items: groups.map((g) => ({
            from_location_id: g.from_location_id!,
            to_location_id: g.to_location_id!,
            details: {
              items: g.items.map((i) => ({
                sku: i.sku,
                item_name: i.item_name,
              })),
            },
            allocations: g.items.map((i) => ({
              item_id: i.item_id!,
              quantity: i.quantity,
              unit_id: i.unit_id!,
              lot_number: i.lot_number?.trim() || null,
              expiry_date: i.expiry_date || null,
            })),
          })),
        },
      });
      message.success({ content: "Tạo đơn nhập thành công!", key: "submit" });
      setSuggested([]);
      onSuccess();
    } catch (err) {
      message.error({ content: errorMessage(err), key: "submit" });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const reviewColumns = [
    {
      title: "Nhóm",
      key: "group",
      width: 90,
      render: (_: unknown, __: ImportGroupDraft, index: number) =>
        `Nhóm ${index + 1}`,
    },
    {
      title: "Điểm cấp",
      key: "from",
      width: 280,
      render: (_: unknown, g: ImportGroupDraft) => (
        <Select
          className="w-full"
          showSearch
          optionFilterProp="label"
          placeholder="Chọn điểm cấp..."
          value={g.from_location_id}
          options={bufferLocationOptions}
          loading={bufferLocationsLoading}
          notFoundContent={
            bufferLocationsLoading
              ? "Đang tải..."
              : bufferLocationsError
                ? "Không tải được điểm cấp"
                : "Không có điểm cấp"
          }
          onChange={(val) =>
            updateGroup(g.key, { from_location_id: Number(val) })
          }
        />
      ),
    },
    {
      title: "Vị trí đích (gợi ý)",
      key: "to",
      render: (_: unknown, g: ImportGroupDraft) =>
        g.to_location_name
          ? `${g.to_location_name} (#${g.to_location_id})`
          : g.to_location_id
            ? `#${g.to_location_id}`
            : "—",
    },
    {
      title: "Số SKU",
      key: "count",
      width: 90,
      render: (_: unknown, g: ImportGroupDraft) => g.items.length,
    },
  ];

  const renderGroupItemsEditor = (group: ImportGroupDraft) => (
    <div className="space-y-3 py-1">
      {group.items.map((item, itemIndex) => (
        <div
          key={item.key}
          className="p-3 bg-white border border-stripe-hairline rounded-md"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              SKU {itemIndex + 1}
            </span>
            {group.items.length > 1 && (
              <Button
                variant="dangerText"
                icon={<DeleteOutlined />}
                onClick={() => handleRemoveItem(group.key, item.key)}
              />
            )}
          </div>
          <div className="space-y-3">
            <div>
              {item.allocation_id ? (
                <Input
                  value={
                    item.sku
                      ? `${item.sku}${item.item_name ? ` — ${item.item_name}` : ""}`
                      : ""
                  }
                  disabled
                />
              ) : (
                <SkuSearchSelect
                  warehouseId={selectedWarehouseId || 0}
                  value={item.sku}
                  onChange={(sku) => {
                    if (!sku) {
                      updateItem(group.key, item.key, {
                        sku: undefined,
                        item_id: undefined,
                        item_name: undefined,
                        unit_id: undefined,
                        unit_options: undefined,
                        converted_quantity: undefined,
                        converted_unit_name: undefined,
                      });
                    } else {
                      updateItem(group.key, item.key, { sku });
                    }
                  }}
                  onSelectOption={async (opt) => {
                    if (!opt?.item_id) return;
                    const quantity =
                      opt.base_quantity != null && opt.base_quantity > 0
                        ? opt.base_quantity
                        : 1;
                    try {
                      const available = await loadItemUnits(
                        group.key,
                        item.key,
                        opt.item_id,
                      );
                      updateItem(group.key, item.key, {
                        sku: opt.value,
                        item_id: opt.item_id,
                        item_name: opt.item_name,
                        quantity,
                        unit_id: available.base_unit_id,
                      });
                      await refreshConvertedQuantity(
                        group.key,
                        item.key,
                        opt.item_id,
                        available.base_unit_id,
                        quantity,
                      );
                    } catch (err) {
                      message.error(errorMessage(err));
                    }
                  }}
                />
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input
                type="number"
                min={1}
                prefix={<span className="text-xs text-slate-400">SL:</span>}
                value={item.quantity}
                onChange={(e) => {
                  const quantity = Number(e.target.value) || 0;
                  updateItem(group.key, item.key, { quantity });
                  if (item.item_id && item.unit_id) {
                    void refreshConvertedQuantity(
                      group.key,
                      item.key,
                      item.item_id,
                      item.unit_id,
                      quantity,
                    );
                  }
                }}
              />
              <Select
                className="w-full"
                placeholder="Unit"
                value={item.unit_id}
                options={item.unit_options ?? unitOptions}
                onChange={async (val) => {
                  const unitId = Number(val);
                  updateItem(group.key, item.key, { unit_id: unitId });
                  if (item.item_id) {
                    try {
                      await loadItemUnits(group.key, item.key, item.item_id);
                    } catch (err) {
                      message.error(errorMessage(err));
                      return;
                    }
                  }
                  if (item.item_id && item.quantity > 0) {
                    void refreshConvertedQuantity(
                      group.key,
                      item.key,
                      item.item_id,
                      unitId,
                      item.quantity,
                    );
                  }
                }}
              />
              <Input
                disabled
                prefix={<span className="text-xs text-slate-400">Quy đổi:</span>}
                value={
                  item.converted_quantity != null && item.converted_unit_name
                    ? `${formatQuantity(item.converted_quantity)} ${item.converted_unit_name}`
                    : "—"
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="LOT"
                value={item.lot_number || ""}
                onChange={(e) =>
                  updateItem(group.key, item.key, {
                    lot_number: e.target.value,
                  })
                }
              />
              <DatePicker
                className="w-full"
                placeholder="Hạn sử dụng"
                format="DD/MM/YYYY"
                value={item.expiry_date ? dayjs(item.expiry_date) : null}
                onChange={(date) =>
                  updateItem(group.key, item.key, {
                    expiry_date: date ? date.format("YYYY-MM-DD") : undefined,
                  })
                }
              />
            </div>
          </div>
        </div>
      ))}
      <AntButton
        type="dashed"
        icon={<PlusOutlined />}
        className="w-full"
        onClick={() => handleAddItem(group.key)}
      >
        Thêm SKU vào nhóm này
      </AntButton>
    </div>
  );

  const reviewItemColumns = [
    {
      title: "Item",
      key: "item",
      render: (_: unknown, i: ImportItemDraft) =>
        `${i.sku || i.item_id}${i.item_name ? ` — ${i.item_name}` : ""}`,
    },
    { title: "SL", dataIndex: "quantity", key: "quantity", width: 90 },
    {
      title: "Đơn vị",
      key: "unit",
      width: 120,
      render: (_: unknown, i: ImportItemDraft) =>
        units.find((u) => u.id === i.unit_id)?.name ?? "—",
    },
    {
      title: "Số lô",
      key: "lot",
      width: 140,
      render: (_: unknown, i: ImportItemDraft) => i.lot_number || "—",
    },
    {
      title: "HSD",
      key: "expiry",
      width: 130,
      render: (_: unknown, i: ImportItemDraft) =>
        i.expiry_date ? dayjs(i.expiry_date).format("DD/MM/YYYY") : "—",
    },
  ];

  return (
    <Modal
      title={
        <span className="text-xl font-bold text-brand-dark">
          {isEdit ? "Cập nhật Phiếu Nhập Kho" : "Tạo Phiếu Nhập Kho"}
        </span>
      }
      open={open}
      onCancel={() => void handleClose()}
      width={1040}
      centered
      footer={
        <div className="flex justify-between items-center w-full">
          {!isEdit && step === 1 ? (
            <AntButton
              onClick={() => {
                void releaseSuggestedLocations().then(() => {
                  setSuggested([]);
                  setGroups((prev) =>
                    prev.map((g) => ({
                      ...g,
                      to_location_id: undefined,
                      to_location_name: undefined,
                      from_location_id: undefined,
                    })),
                  );
                  setStep(0);
                });
              }}
            >
              Quay lại
            </AntButton>
          ) : (
            <div />
          )}
          <Space>
            <AntButton onClick={() => void handleClose()}>Hủy</AntButton>
            {isEdit ? (
              <AntButton
                type="primary"
                className="bg-brand-primary"
                loading={isSubmitting}
                onClick={() => void handleSubmit()}
              >
                Xác nhận Cập Nhật
              </AntButton>
            ) : step === 0 ? (
              <AntButton
                type="primary"
                className="bg-brand-primary"
                loading={suggestMutation.isPending}
                onClick={() => void handleContinue()}
              >
                Tiếp tục (Gợi ý vị trí)
              </AntButton>
            ) : (
              <AntButton
                type="primary"
                className="bg-brand-primary"
                loading={isSubmitting}
                onClick={() => void handleSubmit()}
              >
                Xác nhận Tạo Đơn
              </AntButton>
            )}
          </Space>
        </div>
      }
    >
      {!isEdit && (
        <Steps
          current={step}
          className="mb-6 mt-4"
          items={[
            { title: "Khai báo hàng hóa" },
            { title: "Gợi ý vị trí & chọn điểm cấp" },
          ]}
        />
      )}

      <Form layout="vertical" className="mb-4">
        {(step === 0 && !isEdit) || isEdit ? (
          <Form.Item label="Mã đơn" required className="mb-0">
            <Input
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              disabled={isEdit}
            />
          </Form.Item>
        ) : null}
        <Form.Item
          label="Ghi chú"
          className={(step === 0 && !isEdit) || isEdit ? "mb-0 mt-4" : "mb-0"}
        >
          <Input.TextArea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú đơn nhập..."
          />
        </Form.Item>
      </Form>

      {step === 0 && !isEdit && (
        <div className="space-y-4">
          <Divider titlePlacement="left" className="!text-sm text-slate-400">
            DỮ LIỆU HÀNG HÓA — MỖI NHÓM LÀ MỘT VỊ TRÍ ĐÍCH
          </Divider>

          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {groups.map((group, groupIndex) => (
              <div
                key={group.key}
                className="p-4 bg-slate-50 border border-stripe-hairline rounded-lg space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-brand-dark">
                    Nhóm {groupIndex + 1}
                  </span>
                  {groups.length > 1 && (
                    <Button
                      variant="dangerText"
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveGroup(group.key)}
                    />
                  )}
                </div>

                {renderGroupItemsEditor(group)}
              </div>
            ))}
          </div>

          <AntButton
            type="dashed"
            icon={<PlusOutlined />}
            className="w-full h-11"
            onClick={handleAddGroup}
          >
            Thêm nhóm (vị trí đích mới)
          </AntButton>
        </div>
      )}

      {isEdit && (
        <div className="space-y-4">
          <Divider titlePlacement="left" className="!text-sm text-slate-400">
            DỮ LIỆU HÀNG HÓA — MỖI NHÓM LÀ MỘT VỊ TRÍ ĐÍCH
          </Divider>

          <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
            {groups.map((group, groupIndex) => (
              <div
                key={group.key}
                className="p-4 bg-slate-50 border border-stripe-hairline rounded-lg space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-brand-dark">
                      Nhóm {groupIndex + 1}
                    </span>
                    {group.to_location_name && (
                      <Tag color="green">Đích: {group.to_location_name}</Tag>
                    )}
                    {group.status && <Tag>{group.status}</Tag>}
                  </div>
                  {groups.length > 1 && (
                    <Button
                      variant="dangerText"
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveGroup(group.key)}
                    />
                  )}
                </div>

                <Select
                  className="w-full"
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn điểm cấp (buffer)..."
                  value={group.from_location_id}
                  options={bufferLocationOptions}
                  loading={bufferLocationsLoading}
                  notFoundContent={
                    bufferLocationsLoading
                      ? "Đang tải..."
                      : bufferLocationsError
                        ? "Không tải được điểm cấp"
                        : "Không có điểm cấp"
                  }
                  onChange={(val) =>
                    updateGroup(group.key, { from_location_id: Number(val) })
                  }
                />

                {renderGroupItemsEditor(group)}
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 1 && !isEdit && (
        <div className="space-y-3">
          <div className="bg-brand-primary/10 p-3 rounded-lg border border-brand-primary/20 text-sm">
            Hệ thống đã gợi ý vị trí đích cho từng nhóm. Chọn điểm cấp (buffer)
            cho mỗi nhóm trước khi xác nhận.
          </div>
          <Table
            columns={reviewColumns}
            dataSource={groups}
            pagination={false}
            rowKey="key"
            size="small"
            expandable={{
              expandedRowRender: (g: ImportGroupDraft) => (
                <Table
                  columns={reviewItemColumns}
                  dataSource={g.items}
                  pagination={false}
                  rowKey="key"
                  size="small"
                />
              ),
            }}
          />
        </div>
      )}
    </Modal>
  );
}
