import { useEffect } from "react";
import { DatePicker, Spin } from "antd";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  message,
} from "@/components/ui";
import dayjs from "dayjs";
import {
  useGetStocktakeItemFormData,
  useRecordStocktakeItemCount,
} from "@/hooks/useStocktake";
import { useWarehouseLocations } from "@/hooks/useZones";
import { useAppStore } from "@/store/useAppStore";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";
import type { StocktakeItemStock } from "@/types/stocktake";

const STOCK_STATUS_OPTIONS = [
  { value: "available", label: "Sẵn sàng" },
  { value: "reserved", label: "Đã giữ chỗ" },
  { value: "cross_dock_reserved", label: "Cross-dock giữ chỗ" },
];

type FormValues = {
  actual_quantity: number;
  lot_number: string;
  expiry_date?: dayjs.Dayjs | null;
  location_id: number;
  status: string;
};

interface StocktakeRecordCountModalProps {
  open: boolean;
  record: StocktakeItemStock | null;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function StocktakeRecordCountModal({
  open,
  record,
  onCancel,
  onSuccess,
}: StocktakeRecordCountModalProps) {
  const [form] = Form.useForm<FormValues>();
  const warehouseId = useAppStore((state) => state.selectedWarehouseId) || 0;
  const stocktakeItemId = record?.id ?? 0;

  const { data: formData, isLoading } = useGetStocktakeItemFormData(
    stocktakeItemId,
    open && stocktakeItemId > 0,
  );
  const { data: locations = [], isLoading: isLocationsLoading } =
    useWarehouseLocations(warehouseId);
  const recordMutation = useRecordStocktakeItemCount();

  useEffect(() => {
    if (!open || !formData) return;
    form.setFieldsValue({
      actual_quantity: 0,
      lot_number: formData.lot_number || "",
      expiry_date: formData.expiry_date ? dayjs(formData.expiry_date) : null,
      location_id: formData.location_id,
      status: formData.status,
    });
  }, [open, formData, form]);

  const handleClose = () => {
    form.resetFields();
    onCancel();
  };

  const handleSubmit = (values: FormValues) => {
    if (!record) return;
    recordMutation.mutate(
      {
        stocktakeId: record.stocktake_id,
        stocktakeItemId: record.id,
        payload: {
          actual_quantity: values.actual_quantity,
          lot_number: values.lot_number.trim() || undefined,
          expiry_date: values.expiry_date
            ? values.expiry_date.format("YYYY-MM-DD")
            : undefined,
          location_id: values.location_id,
          status: values.status,
        },
      },
      {
        onSuccess: () => {
          message.success("Ghi nhận kiểm kê thành công!");
          handleClose();
          onSuccess();
        },
        onError: (err) => message.error(getApiErrorMessage(err)),
      },
    );
  };

  return (
    <Modal
      open={open}
      title="Ghi nhận kiểm kê"
      onCancel={handleClose}
      footer={null}
      width={560}
      destroyOnHidden
    >
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spin />
        </div>
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="mt-2"
        >
          <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <p>
              <span className="text-slate-500">Mã SP: </span>
              <span className="font-semibold text-brand-dark">
                {formData?.item_sku || "—"}
              </span>
            </p>
            <p className="mt-1">
              <span className="text-slate-500">Sản phẩm: </span>
              <span className="font-medium">{formData?.item_name || "—"}</span>
            </p>
            <p className="mt-1">
              <span className="text-slate-500">SL hệ thống: </span>
              <span className="font-semibold text-brand-primary">
                {formData?.desired_quantity ?? "—"}
              </span>
            </p>
          </div>

          <Form.Item
            name="actual_quantity"
            label="Số lượng thực tế"
            rules={[
              { required: true, message: "Vui lòng nhập số lượng thực tế!" },
              { type: "number", min: 0, message: "Giá trị phải >= 0" },
            ]}
          >
            <InputNumber min={0} precision={0} className="!w-full" />
          </Form.Item>

          <Form.Item
            name="lot_number"
            label="Số lô"
            rules={[{ required: true, message: "Vui lòng nhập số lô!" }]}
          >
            <Input placeholder="vd: 090426-100426" />
          </Form.Item>

          <Form.Item name="expiry_date" label="Hạn sử dụng">
            <DatePicker className="w-full" format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item
            name="location_id"
            label="Vị trí"
            rules={[{ required: true, message: "Vui lòng chọn vị trí!" }]}
          >
            <Select
              showSearch
              placeholder="Chọn vị trí"
              optionFilterProp="label"
              loading={isLocationsLoading}
              options={locations.map((loc) => ({
                value: loc.id,
                label: loc.location_name || loc.location_code || `#${loc.id}`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="status"
            label="Trạng thái tồn"
            rules={[{ required: true, message: "Vui lòng chọn trạng thái!" }]}
          >
            <Select options={STOCK_STATUS_OPTIONS} />
          </Form.Item>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={handleClose}>Hủy</Button>
            <Button
              variant="primary"
              htmlType="submit"
              loading={recordMutation.isPending}
            >
              Ghi nhận
            </Button>
          </div>
        </Form>
      )}
    </Modal>
  );
}
