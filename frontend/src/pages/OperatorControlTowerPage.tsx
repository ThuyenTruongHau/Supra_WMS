import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { sendCompletedRobotStatusApi } from "@/api/robot";
import OrderProgressReport from "@/components/reports/OrderProgressReport";
import { Button, Form, Input, Modal, message } from "@/components/ui";
import { useAppStore } from "@/store/useAppStore";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";

export default function OperatorControlTowerPage() {
  const warehouseId = useAppStore((state) => state.selectedWarehouseId);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [form] = Form.useForm<{ orderId: string }>();
  const sendStatus = useMutation({
    mutationFn: sendCompletedRobotStatusApi,
    retry: false,
    onSuccess: (_data, orderId) => {
      message.success(`Đã gửi trạng thái 8 cho ${orderId}.`);
      setStatusModalOpen(false);
      form.resetFields();
    },
    onError: (error) => {
      message.error(getApiErrorMessage(error, "Không thể gửi trạng thái. Vui lòng thử lại."));
    },
  });

  const closeStatusModal = () => {
    if (sendStatus.isPending) return;
    setStatusModalOpen(false);
    form.resetFields();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-dark">Control Tower</h1>
        <Button
          variant="ghost"
          size="small"
          className="opacity-20 transition-opacity hover:opacity-70 focus-visible:opacity-100"
          onClick={() => setStatusModalOpen(true)}
        >
          
        </Button>
      </div>
      <OrderProgressReport warehouseId={warehouseId} />
      <Modal
        open={statusModalOpen}
        title="Gửi trạng thái đơn hàng"
        onCancel={closeStatusModal}
        footer={null}
        width={440}
        closable={!sendStatus.isPending}
        keyboard={!sendStatus.isPending}
        maskClosable={false}
      >
        <p className="mb-4 text-sm text-slate-500">Trạng thái gửi đi cố định: 8.</p>
        <Form
          form={form}
          layout="vertical"
          onFinish={({ orderId }) => {
            if (!sendStatus.isPending) sendStatus.mutate(orderId.trim());
          }}
        >
          <Form.Item
            name="orderId"
            label="orderId"
            rules={[{ required: true, whitespace: true, message: "Vui lòng nhập orderId." }]}
          >
            <Input
              placeholder="VD: TDS_Return_60a26475"
              autoComplete="off"
              disabled={sendStatus.isPending}
            />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeStatusModal} disabled={sendStatus.isPending}>
              Hủy
            </Button>
            <Button htmlType="submit" loading={sendStatus.isPending}>
              Gửi
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
