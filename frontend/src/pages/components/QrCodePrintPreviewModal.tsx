import { PrinterOutlined } from "@ant-design/icons";
import { Button, Modal, Space, message } from "@/components/ui";
import {
  createQrDataUrl,
  printQrCodeLabels,
  type QrCodePrintLabel,
} from "@/utils/printQrCodeLabels";

type QrCodePrintPreviewModalProps = {
  open: boolean;
  labels: QrCodePrintLabel[];
  onClose: () => void;
};

export default function QrCodePrintPreviewModal({
  open,
  labels,
  onClose,
}: QrCodePrintPreviewModalProps) {
  const handlePrint = () => {
    try {
      const printed = printQrCodeLabels(labels);
      if (!printed) {
        message.warning("Không thể mở hộp thoại in.");
        return;
      }
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : "Không thể in mã QR",
      );
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={480}
      destroyOnHidden
      title="Màn hình in mã QR"
      className="[&_.ant-modal-body]:!py-4"
      footer={
        <Space>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button
            variant="primary"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
            disabled={labels.length === 0}
          >
            In
          </Button>
        </Space>
      }
    >
      {labels.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400 italic">
          Không có mã QR để in
        </p>
      ) : (
        <div className="max-h-[320px] overflow-y-auto pr-1">
          <div className="flex flex-wrap justify-center gap-3">
            {labels.map((label) => (
              <div
                key={label.code}
                className="w-[140px] rounded-lg border border-gray-200 bg-slate-50 p-3 text-center"
              >
                <img
                  src={createQrDataUrl(label.code, 112)}
                  alt={label.code}
                  className="mx-auto h-28 w-28 object-contain bg-white"
                />
                <p className="mt-2 break-all text-xs font-bold text-brand-dark">
                  {label.code}
                </p>
                <p className="mt-0.5 truncate text-xs font-semibold text-brand-primary">
                  {label.sku}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500">
                  {label.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
