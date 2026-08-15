import { useEffect, useState } from "react";
import {
  Modal,
  Form,
  Input,
  Button as AntButton,
  Divider,
  Space,
  message,
} from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { Select, Button } from "@/components/ui";
import { SkuSearchSelect } from "@/components/shared/SkuSearchSelect";
import { useAppStore } from "@/store/useAppStore";
import {
  useCreateOutboundOrder,
  useUpdateOutboundOrder,
} from "@/hooks/useOutbound";
import type { OutboundOrderLineItemUpdate } from "@/types/outbound";
import {
  convertQuantityApi,
  getItemAvailableUnitsApi,
} from "@/api/itemUnit";
import { formatQuantity } from "@/utils/formatQuantity";
import dayjs from "dayjs";
import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/apiError";
import KeyValueDetailsEditor from "@/components/shared/KeyValueDetailsEditor";
import {
  detailsToEntries,
  entriesToDetails,
  type KeyValueEntry,
} from "@/utils/keyValueDetails";

export interface OutboundItemDraft {
  key: string;
  detail_id?: number;
  sku?: string;
  item_id?: number;
  item_name?: string;
  quantity: number;
  unit_id?: number;
  unit_options?: { value: number; label: string }[];
  base_unit_id?: number;
  converted_quantity?: number;
  converted_unit_name?: string;
  detailEntries?: KeyValueEntry[];
}

interface CreateOutboundModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  mode?: "create" | "edit";
  editOrderId?: number;
  editOrderCode?: string;
  initialNote?: string;
  initialItems?: OutboundItemDraft[];
  initialDetails?: Record<string, unknown>;
}

let draftSeq = 0;
const nextKey = (prefix: string) => `${prefix}-${Date.now()}-${draftSeq++}`;

export const createEmptyItem = (): OutboundItemDraft => ({
  key: nextKey("item"),
  quantity: 1,
});

function errorMessage(err: unknown): string {
  const ax = err as AxiosError<ApiErrorResponse>;
  const detail = ax?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (err instanceof Error) return err.message;
  return "Có lỗi xảy ra";
}

async function resolveItemsConversion(
  items: OutboundItemDraft[],
): Promise<OutboundItemDraft[]> {
  return Promise.all(
    items.map(async (item) => {
      if (!item.item_id || !item.unit_id || item.quantity <= 0) return item;
      if (item.base_unit_id != null && item.converted_quantity != null) {
        return item;
      }
      const converted = await convertQuantityApi({
        item_id: item.item_id,
        unit_id: item.unit_id,
        quantity: item.quantity,
      });
      return {
        ...item,
        base_unit_id: converted.base_unit_id,
        converted_quantity: Number(converted.converted_quantity),
        converted_unit_name: converted.base_unit_name,
      };
    }),
  );
}

function buildLineItemPayload(
  item: OutboundItemDraft,
  detailType: string,
) {
  if (item.base_unit_id == null || item.converted_quantity == null) {
    throw new Error("Thiếu thông tin quy đổi đơn vị");
  }
  return {
    item_id: item.item_id!,
    quantity: item.converted_quantity,
    unit_id: item.base_unit_id,
    detail_type: detailType,
    details: entriesToDetails(item.detailEntries ?? []),
  };
}

function validateConvertedItems(items: OutboundItemDraft[]): boolean {
  for (const [index, item] of items.entries()) {
    if (item.base_unit_id == null || item.converted_quantity == null) {
      message.error(
        `Dòng ${index + 1}: không quy đổi được đơn vị cho SKU ${item.sku ?? item.item_id ?? ""}`,
      );
      return false;
    }
  }
  return true;
}

export default function CreateOutboundModal({
  open,
  onCancel,
  onSuccess,
  mode = "create",
  editOrderId,
  editOrderCode,
  initialNote,
  initialItems,
  initialDetails,
}: CreateOutboundModalProps) {
  const isEdit = mode === "edit";
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);
  const outboundType = useAppStore((s) => s.outboundType);

  const [orderCode, setOrderCode] = useState("");
  const [note, setNote] = useState("");
  const [detailEntries, setDetailEntries] = useState<KeyValueEntry[]>([]);
  const [items, setItems] = useState<OutboundItemDraft[]>([createEmptyItem()]);
  const [originalItems, setOriginalItems] = useState<OutboundItemDraft[]>([]);

  const createMutation = useCreateOutboundOrder();
  const updateMutation = useUpdateOutboundOrder();

  useEffect(() => {
    if (!open) return;
    const nextItems =
      initialItems && initialItems.length > 0
        ? initialItems.map((item) => ({ ...item, key: item.key || nextKey("item") }))
        : [createEmptyItem()];
    setItems(nextItems);
    if (isEdit) {
      setOrderCode(editOrderCode ?? "");
      setNote(initialNote ?? "");
      setDetailEntries(detailsToEntries(initialDetails));
      setOriginalItems(
        initialItems && initialItems.length > 0
          ? initialItems.map((item) => ({ ...item }))
          : [],
      );
    } else {
      setOrderCode(`OUT-${dayjs().format("YYYYMMDD-HHmmss")}`);
      setNote("");
      setDetailEntries([]);
      setOriginalItems([]);
    }
  }, [open, isEdit, editOrderCode, initialNote, initialItems, initialDetails]);

  const updateItem = (itemKey: string, patch: Partial<OutboundItemDraft>) => {
    setItems((prev) =>
      prev.map((item) => (item.key === itemKey ? { ...item, ...patch } : item)),
    );
  };

  const refreshConvertedQuantity = async (
    itemKey: string,
    itemId: number,
    unitId: number,
    quantity: number,
  ) => {
    if (!itemId || !unitId || quantity <= 0) {
      updateItem(itemKey, {
        converted_quantity: undefined,
        converted_unit_name: undefined,
        base_unit_id: undefined,
      });
      return;
    }
    try {
      const converted = await convertQuantityApi({
        item_id: itemId,
        unit_id: unitId,
        quantity,
      });
      updateItem(itemKey, {
        converted_quantity: Number(converted.converted_quantity),
        converted_unit_name: converted.base_unit_name,
        base_unit_id: converted.base_unit_id,
      });
    } catch (err) {
      updateItem(itemKey, {
        converted_quantity: undefined,
        converted_unit_name: undefined,
        base_unit_id: undefined,
      });
      message.error(errorMessage(err));
    }
  };

  const loadItemUnits = async (itemKey: string, itemId: number) => {
    const available = await getItemAvailableUnitsApi(itemId);
    updateItem(itemKey, {
      unit_options: available.units.map((u) => ({
        value: u.unit_id,
        label: u.unit_name,
      })),
    });
    return available;
  };

  useEffect(() => {
    if (!open || !isEdit || !initialItems?.length) return;

    let cancelled = false;

    void (async () => {
      try {
        const entries = await Promise.all(
          initialItems
            .filter((item) => item.item_id)
            .map(async (item) => {
              const available = await getItemAvailableUnitsApi(item.item_id!);
              return {
                itemKey: item.key,
                unit_options: available.units.map((u) => ({
                  value: u.unit_id,
                  label: u.unit_name,
                })),
                unit_id: item.unit_id ?? available.base_unit_id,
                quantity: item.quantity,
                item_id: item.item_id!,
              };
            }),
        );
        if (cancelled) return;
        setItems((prev) =>
          prev.map((item) => {
            const entry = entries.find((e) => e.itemKey === item.key);
            return entry
              ? {
                  ...item,
                  unit_options: entry.unit_options,
                  unit_id: entry.unit_id,
                }
              : item;
          }),
        );
        for (const entry of entries) {
          if (entry.unit_id && entry.quantity > 0) {
            await refreshConvertedQuantity(
              entry.itemKey,
              entry.item_id,
              entry.unit_id,
              entry.quantity,
            );
          }
        }
      } catch (err) {
        if (!cancelled) message.error(errorMessage(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, isEdit, initialItems]);

  const handleAddItem = () => {
    setItems((prev) => [...prev, createEmptyItem()]);
  };

  const handleRemoveItem = (itemKey: string) => {
    setItems((prev) => {
      if (prev.length <= 1) {
        message.warning("Đơn xuất cần ít nhất một dòng hàng");
        return prev;
      }
      return prev.filter((item) => item.key !== itemKey);
    });
  };

  const validateForm = (): boolean => {
    if (!orderCode.trim()) {
      message.error("Vui lòng nhập mã đơn");
      return false;
    }
    for (const item of items) {
      if (!item.item_id) {
        message.error("Vui lòng chọn sản phẩm cho tất cả dòng hàng");
        return false;
      }
      if (!item.quantity || item.quantity <= 0) {
        message.error("Số lượng phải lớn hơn 0");
        return false;
      }
      if (!item.unit_id) {
        message.error("Vui lòng chọn đơn vị cho tất cả dòng hàng");
        return false;
      }
    }
    return true;
  };

  const buildUpdatePayload = (
    sourceItems: OutboundItemDraft[],
  ): OutboundOrderLineItemUpdate[] => {
    const currentDetailIds = new Set(
      sourceItems.map((i) => i.detail_id).filter((id): id is number => !!id),
    );
    const deletedItems: OutboundOrderLineItemUpdate[] = originalItems
      .map((i) => i.detail_id)
      .filter((id): id is number => !!id && !currentDetailIds.has(id))
      .map((id) => ({ id, delete: true }));

    const updatedItems: OutboundOrderLineItemUpdate[] = sourceItems
      .filter((i) => i.detail_id)
      .map((i) => ({
        id: i.detail_id!,
        ...buildLineItemPayload(i, outboundType),
      }));

    const newItems: OutboundOrderLineItemUpdate[] = sourceItems
      .filter((i) => !i.detail_id)
      .map((i) => buildLineItemPayload(i, outboundType));

    return [...deletedItems, ...updatedItems, ...newItems];
  };

  const handleSubmit = async () => {
    if (!selectedWarehouseId || !validateForm()) return;

    if (isEdit) {
      if (!editOrderId) return;
      try {
        message.loading({ content: "Đang cập nhật đơn xuất...", key: "submit" });
        const resolvedItems = await resolveItemsConversion(items);
        if (!validateConvertedItems(resolvedItems)) return;

        await updateMutation.mutateAsync({
          orderId: editOrderId,
          outboundType,
          data: {
            note: note.trim() || null,
            details: entriesToDetails(detailEntries),
            line_items: buildUpdatePayload(resolvedItems),
          },
        });
        message.success({
          content: "Cập nhật đơn xuất thành công!",
          key: "submit",
        });
        onSuccess();
      } catch (err) {
        message.error({ content: errorMessage(err), key: "submit" });
      }
      return;
    }

    try {
      message.loading({ content: "Đang tạo đơn xuất...", key: "submit" });
      const resolvedItems = await resolveItemsConversion(items);
      if (!validateConvertedItems(resolvedItems)) return;

      await createMutation.mutateAsync({
        outboundType,
        data: {
          order_code: orderCode.trim(),
          note: note.trim() || null,
          warehouse_id: selectedWarehouseId,
          details: entriesToDetails(detailEntries),
          line_items: resolvedItems.map((i) => buildLineItemPayload(i, outboundType)),
        },
      });
      message.success({
        content: "Tạo đơn xuất thành công!",
        key: "submit",
      });
      onSuccess();
    } catch (err) {
      message.error({ content: errorMessage(err), key: "submit" });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const renderItemEditor = (item: OutboundItemDraft, itemIndex: number) => (
    <div
      key={item.key}
      className="space-y-3 rounded-lg border border-stripe-hairline bg-slate-50 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-brand-dark">Dòng {itemIndex + 1}</span>
        {items.length > 1 && (
          <Button
            variant="dangerText"
            icon={<DeleteOutlined />}
            onClick={() => handleRemoveItem(item.key)}
          />
        )}
      </div>

      <div>
        {item.detail_id ? (
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
                updateItem(item.key, {
                  sku: undefined,
                  item_id: undefined,
                  item_name: undefined,
                  unit_id: undefined,
                  unit_options: undefined,
                  base_unit_id: undefined,
                  converted_quantity: undefined,
                  converted_unit_name: undefined,
                });
              } else {
                updateItem(item.key, { sku });
              }
            }}
            onSelectOption={async (opt) => {
              if (!opt?.item_id) {
                updateItem(item.key, {
                  sku: undefined,
                  item_id: undefined,
                  item_name: undefined,
                  unit_id: undefined,
                  unit_options: undefined,
                  base_unit_id: undefined,
                  converted_quantity: undefined,
                  converted_unit_name: undefined,
                });
                return;
              }
              const quantity =
                opt.base_quantity != null && opt.base_quantity > 0
                  ? opt.base_quantity
                  : 1;
              try {
                const available = await loadItemUnits(item.key, opt.item_id);
                updateItem(item.key, {
                  sku: opt.value,
                  item_id: opt.item_id,
                  item_name: opt.item_name,
                  quantity,
                  unit_id: available.base_unit_id,
                });
                await refreshConvertedQuantity(
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
            const quantity = Math.max(1, Number(e.target.value) || 1);
            updateItem(item.key, { quantity });
            if (item.item_id && item.unit_id) {
              void refreshConvertedQuantity(
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
          options={item.unit_options ?? []}
          disabled={!item.item_id || !(item.unit_options?.length)}
          onChange={async (val) => {
            const unitId = Number(val);
            updateItem(item.key, { unit_id: unitId });
            if (item.item_id) {
              try {
                await loadItemUnits(item.key, item.item_id);
              } catch (err) {
                message.error(errorMessage(err));
                return;
              }
            }
            if (item.item_id && item.quantity > 0) {
              void refreshConvertedQuantity(
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

      <KeyValueDetailsEditor
        entries={item.detailEntries ?? []}
        onChange={(entries) => updateItem(item.key, { detailEntries: entries })}
        label="Thông tin bổ sung dòng"
        addButtonText="Thêm trường dòng"
        className="mt-3 border-t border-stripe-hairline pt-3"
      />
    </div>
  );

  return (
    <Modal
      title={
        <span className="text-xl font-bold text-brand-dark">
          {isEdit ? "Cập nhật Phiếu Xuất Kho" : "Tạo Phiếu Xuất Kho"}
        </span>
      }
      open={open}
      onCancel={onCancel}
      width={1040}
      centered
      footer={
        <div className="flex justify-end items-center w-full">
          <Space>
            <AntButton onClick={onCancel}>Hủy</AntButton>
            <AntButton
              type="primary"
              className="bg-brand-primary"
              loading={isSubmitting}
              onClick={() => void handleSubmit()}
            >
              {isEdit ? "Xác nhận Cập Nhật" : "Xác nhận Tạo Đơn"}
            </AntButton>
          </Space>
        </div>
      }
    >
      <Form layout="vertical" className="mb-2">
        <Form.Item label="Mã đơn" required className="mb-0">
          <Input
            value={orderCode}
            onChange={(e) => setOrderCode(e.target.value)}
            disabled={isEdit}
          />
        </Form.Item>
        <Form.Item label="Ghi chú" className="mb-0 mt-4">
          <Input.TextArea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú đơn xuất..."
          />
        </Form.Item>
      </Form>

      <Divider titlePlacement="left" className="!text-sm text-slate-400">
        THÔNG TIN BỔ SUNG ĐƠN
      </Divider>
      <KeyValueDetailsEditor
        entries={detailEntries}
        onChange={setDetailEntries}
        label="Thông tin bổ sung đơn"
        addButtonText="Thêm trường đơn"
        className="mb-2"
      />

      <Divider titlePlacement="left" className="!mt-6 !text-sm text-slate-400">
        DANH SÁCH HÀNG XUẤT
      </Divider>

      <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
        {items.map((item, itemIndex) => renderItemEditor(item, itemIndex))}
      </div>

      <AntButton
        type="dashed"
        icon={<PlusOutlined />}
        className="mt-4 h-11 w-full"
        onClick={handleAddItem}
      >
        Thêm loại hàng
      </AntButton>
    </Modal>
  );
}

export function resolveUnitIdFromName(
  unitName: string | undefined,
  unitIdByName: Map<string, number>,
): number | undefined {
  if (!unitName) return undefined;
  return unitIdByName.get(unitName);
}
