import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  message,
} from "@/components/ui";
import { updateInboundBufferStockApi } from "@/api/itemStock";
import type { InboundBufferStockUpdate } from "@/types/itemStock";
import type { ItemStockDetail } from "@/types/warehouseMap";
import { getApiErrorDetail } from "@/types/apiError";
import {
  parseLegacyLotNumber,
  validateLotNumber,
} from "@/utils/lotNumberValidation";

type Props = {
  stock: ItemStockDetail;
  locationId: number;
  locationName: string;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onBufferChanged: () => Promise<unknown>;
};

type Values = { quantity: number; lot: string; expiry: string };

export default function EditInboundBufferStockModal({
  stock,
  locationId,
  locationName,
  onClose,
  onSaved,
  onBufferChanged,
}: Props) {
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const initialLot = stock.lot_number?.trim() ?? "";
  const initialExpiry = stock.expiry_date?.trim() ?? "";

  const save = async (values: Values) => {
    if (savingRef.current) return;
    const body: InboundBufferStockUpdate = {};
    if (values.quantity !== Number(stock.quantity))
      body.quantity = values.quantity;
    const lot = values.lot?.trim() ?? "";
    if (lot !== initialLot) {
      if (lot) {
        const parsed = parseLegacyLotNumber(lot);
        body.lot_number_from = parsed.from;
        body.lot_number_to = parsed.to;
      } else {
        body.lot_number_from = null;
        body.lot_number_to = null;
      }
    }
    const expiry = values.expiry?.trim() ?? "";
    if (expiry !== initialExpiry) body.expiry_date = expiry || null;
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await updateInboundBufferStockApi(stock.id, locationId, body);
      message.success("Đã cập nhật hàng tại buffer và đồng bộ đơn nhập");
      await onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.detail : undefined;
      if (detail?.code === "inbound_buffer_changed") {
        message.warning(detail.message);
        await onBufferChanged();
      } else {
        message.error(
          typeof detail?.message === "string"
            ? detail.message
            : getApiErrorDetail(err, "Không thể cập nhật hàng tại buffer"),
        );
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Chỉnh sửa hàng tại buffer"
      onCancel={onClose}
      closable={!saving}
      mask={{ closable: !saving }}
      keyboard={!saving}
      width={520}
      footer={[
        <Button
          key="cancel"
          variant="secondary"
          disabled={saving}
          onClick={onClose}
        >
          Hủy
        </Button>,
        <Button
          key="save"
          aria-label="Lưu"
          loading={saving}
          disabled={saving}
          onClick={() => form.submit()}
        >
          Lưu
        </Button>,
      ]}
    >
      <p className="mb-4 text-base text-slate-600">
        {locationName} · {stock.sku || `#${stock.item_id}`}
      </p>
      <Form
        form={form}
        layout="vertical"
        disabled={saving}
        onFinish={save}
        initialValues={{
          quantity: Number(stock.quantity),
          lot: initialLot,
          expiry: initialExpiry,
        }}
      >
        <Form.Item
          name="quantity"
          label="Số lượng"
          rules={[
            { required: true, message: "Vui lòng nhập số lượng" },
            {
              validator: (_, value) =>
                Number.isSafeInteger(value) && value >= 0 && value <= 999999999
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error(
                        "Số lượng phải là số nguyên từ 0 đến 999999999",
                      ),
                    ),
            },
          ]}
        >
          <InputNumber min={0} max={999999999} step={1} />
        </Form.Item>
        <Form.Item
          name="lot"
          label="LOT"
          rules={[
            {
              validator: (_, value) => {
                // Preserve unchanged legacy values; validate only a newly entered LOT.
                if ((value?.trim() ?? "") === initialLot)
                  return Promise.resolve();
                const result = validateLotNumber(value, {
                  format: "legacy",
                  label: "LOT",
                });
                return result.valid
                  ? Promise.resolve()
                  : Promise.reject(new Error(result.message));
              },
            },
          ]}
        >
          <Input maxLength={50} placeholder="VD: 141026 hoặc 141026-151026" />
        </Form.Item>
        <Form.Item name="expiry" label="Hạn dùng">
          <Input maxLength={50} placeholder="VD: 14/10/2027" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
