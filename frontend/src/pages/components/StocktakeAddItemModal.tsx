import { useEffect, useState } from "react";
import { DatePicker } from "antd";
import type { Dayjs } from "dayjs";
import { Button, Form, Input, InputNumber, Modal, Select, message } from "@/components/ui";
import { useAddStocktakeItem } from "@/hooks/useStocktake";
import { useGetItems } from "@/hooks/useItem";
import { useWarehouseLocations } from "@/hooks/useZones";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";
import { translateStatus } from "@/i18n/statusLabels.vi";
import type { StocktakeAddItemInput } from "@/types/stocktake";

type FormValues = Omit<StocktakeAddItemInput, "expiry_date"> & { expiry_date?: Dayjs | null };

export default function StocktakeAddItemModal({ open, stocktakeId, warehouseId, onClose }: {
  open: boolean;
  stocktakeId: number;
  warehouseId: number;
  onClose: () => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const [search, setSearch] = useState("");
  const mutation = useAddStocktakeItem();
  const { data: locations = [], isLoading: loadingLocations } = useWarehouseLocations(open ? warehouseId : 0);
  const { data: items, isLoading: loadingItems } = useGetItems({
    warehouse_id: warehouseId, q: search || undefined,
    page: 1, page_size: 100, enabled: open && warehouseId > 0,
  });

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleClose = () => { setSearch(""); onClose(); };

  const submit = (values: FormValues) => {
    mutation.mutate({ stocktakeId, payload: {
      ...values,
      lot_number: values.lot_number.trim(),
      expiry_date: values.expiry_date?.format("YYYY-MM-DD") ?? null,
    } }, {
      onSuccess: () => { message.success("Đã ghi nhận. Bấm Xác nhận SL để cập nhật tồn kho."); handleClose(); },
      onError: (error) => message.error(getApiErrorMessage(error)),
    });
  };

  return (
    <Modal open={open} title="Thêm hàng kiểm kê" onCancel={handleClose} footer={null} width={560} destroyOnHidden>
      <p className="mb-4 text-sm text-slate-500">
        Dùng khi tìm thấy hàng ở ô trống hoặc SKU/lô chưa có trong hệ thống tại vị trí này.
        Tồn kho chỉ thay đổi sau khi xác nhận số lượng.
      </p>
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ status: "available" }}>
        <Form.Item name="location_id" label="Vị trí" rules={[{ required: true, message: "Vui lòng chọn vị trí" }]}>
          <Select showSearch optionFilterProp="label" loading={loadingLocations} placeholder="Tìm tên hoặc mã vị trí"
            options={locations.filter((loc) => loc.is_active).map((loc) => ({
              value: loc.id, label: `${loc.location_name || loc.location_code} — ${loc.location_code}`,
            }))} />
        </Form.Item>
        <Form.Item name="item_id" label="Sản phẩm" rules={[{ required: true, message: "Vui lòng chọn SKU" }]}>
          <Select showSearch filterOption={false} onSearch={setSearch} loading={loadingItems} placeholder="Tìm mã hoặc tên sản phẩm"
            options={(items?.items ?? []).filter((item) => item.is_active).map((item) => ({ value: item.id, label: `${item.sku} — ${item.name} (${item.base_unit})` }))} />
        </Form.Item>
        <Form.Item name="lot_number" label="Số lô" rules={[{ required: true, whitespace: true, message: "Vui lòng nhập số lô" }]}>
          <Input placeholder="VD: 011026 hoặc 011026-021026" maxLength={50} />
        </Form.Item>
        <Form.Item name="expiry_date" label="Hạn sử dụng"><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
        <Form.Item name="actual_quantity" label="Số lượng thực tế (đơn vị gốc của sản phẩm)"
          rules={[{ required: true, message: "Vui lòng nhập số lượng thực đếm" }, { type: "number", min: 0 }]}>
          <InputNumber min={0} precision={0} className="!w-full" />
        </Form.Item>
        <Form.Item name="status" label="Trạng thái tồn" rules={[{ required: true }]}>
          <Select options={["available", "split", "damaged", "quarantine", "expired"].map((value) => ({ value, label: translateStatus(value) }))} />
        </Form.Item>
        <div className="flex justify-end gap-2"><Button onClick={handleClose}>Hủy</Button>
          <Button variant="primary" htmlType="submit" loading={mutation.isPending}>Ghi nhận</Button>
        </div>
      </Form>
    </Modal>
  );
}
