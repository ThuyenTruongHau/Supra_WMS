import { Button, Input, Modal, Select, Space } from "@/components/ui";
import { SkuSearchSelect } from "@/components/shared/SkuSearchSelect";
import {
  QR_PRINT_LABELS_PER_PAGE,
  QR_PRINT_MAX_QUANTITY,
  QR_TYPE_OPTIONS,
  useQrCodePrint,
} from "@/hooks/useQrCodePrint";
import type { QrPrintType } from "@/types/item";

const SKU_BROWSE_PAGE_SIZE = 20;

type QrCodeGeneratePrintModalProps = {
  open: boolean;
  onClose: () => void;
  warehouseId: number;
  defaultItemId?: number | null;
  defaultSku?: string;
};

export default function QrCodeGeneratePrintModal({
  open,
  onClose,
  warehouseId,
  defaultItemId = null,
  defaultSku,
}: QrCodeGeneratePrintModalProps) {
  const {
    selectedSku,
    setSelectedSku,
    setSelectedItemId,
    qrType,
    setQrType,
    quantity,
    setQuantity,
    previewHtml,
    previewFrameRef,
    isPreviewStep,
    printTitle,
    handleConfirm,
    isPreviewPending,
  } = useQrCodePrint({
    warehouseId,
    defaultItemId,
    defaultSku,
    active: open,
    onPrintSuccess: onClose,
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={isPreviewStep ? 820 : 560}
      destroyOnHidden
      title={printTitle}
      className="[&_.ant-modal-body]:!py-4"
      footer={
        <Space>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          {!isPreviewStep && (
            <Button
              variant="primary"
              loading={isPreviewPending}
              onClick={() => void handleConfirm()}
            >
              Xác nhận
            </Button>
          )}
        </Space>
      }
    >
      {!isPreviewStep ? (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-600">Sản phẩm</p>
            <SkuSearchSelect
              warehouseId={warehouseId}
              value={selectedSku}
              browsePageSize={SKU_BROWSE_PAGE_SIZE}
              placeholder="Tìm Part_number, tên sản phẩm cần in..."
              disabled={warehouseId <= 0}
              onChange={(sku) => {
                setSelectedSku(sku);
                if (!sku) {
                  setSelectedItemId(null);
                }
              }}
              onSelectOption={(opt) => {
                if (!opt?.item_id) {
                  setSelectedItemId(null);
                  return;
                }
                setSelectedSku(opt.value);
                setSelectedItemId(opt.item_id);
              }}
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-600">Loại phiếu</p>
            <Select
              className="w-full"
              value={qrType}
              options={QR_TYPE_OPTIONS}
              onChange={(value) => setQrType(value as QrPrintType)}
            />
            <p className="mt-1 text-xs text-slate-500">
              {qrType === "transit"
                ? "Dùng mẫu phiếu di chuyển (transit)."
                : qrType === "pack"
                  ? "Dùng mẫu phiếu đóng gói (pack)."
                  : "Dùng mẫu phiếu sản phẩm Bacviet (item)."}
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-600">Số lượng in</p>
            <Input
              type="number"
              min={1}
              max={QR_PRINT_MAX_QUANTITY}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="Nhập số phiếu cần in"
            />
            <p className="mt-1 text-xs text-slate-500">
              {QR_PRINT_LABELS_PER_PAGE} phiếu / trang A4. Tối đa{" "}
              {QR_PRINT_MAX_QUANTITY} phiếu / lần.
            </p>
          </div>
        </div>
      ) : (
        <iframe
          ref={previewFrameRef}
          title="Xem trước phiếu in"
          srcDoc={previewHtml ?? undefined}
          className="h-[70vh] w-full border-0 bg-white"
        />
      )}
    </Modal>
  );
}
