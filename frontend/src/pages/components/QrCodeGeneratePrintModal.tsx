import { useCallback, useEffect, useRef, useState } from "react";
import type { AxiosError } from "axios";
import {
  Button,
  Input,
  Modal,
  Space,
  message,
} from "@/components/ui";
import { SkuSearchSelect } from "@/components/shared/SkuSearchSelect";
import { useCreateQrCodes, usePreviewQrCodes } from "@/hooks/useItem";
import type { ApiErrorResponse } from "@/types/apiError";
import { printBacvietHtml } from "@/utils/printBacvietHtml";

const SKU_BROWSE_PAGE_SIZE = 20;
const MAX_PRINT_QUANTITY = 50;

type QrCodeGeneratePrintModalProps = {
  open: boolean;
  onClose: () => void;
  warehouseId: number;
  defaultItemId?: number | null;
  defaultSku?: string;
};

function getErrorMessage(err: unknown, fallback: string) {
  const detail = (err as AxiosError<ApiErrorResponse>).response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

export default function QrCodeGeneratePrintModal({
  open,
  onClose,
  warehouseId,
  defaultItemId = null,
  defaultSku,
}: QrCodeGeneratePrintModalProps) {
  const [selectedSku, setSelectedSku] = useState<string | undefined>();
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("6");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);

  const previewQrCodes = usePreviewQrCodes();
  const createQrCodes = useCreateQrCodes();

  useEffect(() => {
    if (open) {
      setSelectedSku(defaultSku);
      setSelectedItemId(defaultItemId);
      setQuantity("6");
      setPreviewHtml(null);
    }
  }, [open, defaultItemId, defaultSku]);

  const parsedQuantity = Number.parseInt(quantity, 10);
  const isQuantityValid =
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0 &&
    parsedQuantity <= MAX_PRINT_QUANTITY;

  const handleConfirm = async () => {
    if (!selectedItemId) {
      message.warning("Vui lòng chọn sản phẩm từ danh sách (bấm Tìm nếu cần)");
      return;
    }
    if (!isQuantityValid) {
      message.warning(`Số lượng in phải từ 1 đến ${MAX_PRINT_QUANTITY}`);
      return;
    }

    try {
      const result = await previewQrCodes.mutateAsync({
        itemId: selectedItemId,
        quantity: parsedQuantity,
      });
      setPreviewHtml(result.html);
    } catch (err) {
      message.error(getErrorMessage(err, "Không thể tạo bản xem trước"));
    }
  };

  const handlePrintRequest = useCallback(
    async (itemId: number, printQuantity: number) => {
      if (createQrCodes.isPending) return;
      try {
        const result = await createQrCodes.mutateAsync({
          itemId,
          quantity: printQuantity,
        });
        const printed = printBacvietHtml(result.html);
        if (!printed) {
          message.warning("Không thể mở hộp thoại in");
          return;
        }
        onClose();
      } catch (err) {
        message.error(getErrorMessage(err, "Không thể tạo mã QR để in"));
      }
    },
    [createQrCodes, onClose],
  );

  useEffect(() => {
    if (!open) return;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== previewFrameRef.current?.contentWindow) return;
      if (event.data?.type !== "bacviet-qr-print") return;
      const itemId = Number(event.data.item_id);
      const printQuantity = Number(event.data.quantity);
      if (!itemId || !printQuantity) return;
      void handlePrintRequest(itemId, printQuantity);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, handlePrintRequest]);

  const isPreviewStep = previewHtml != null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={isPreviewStep ? 820 : 560}
      destroyOnHidden
      title="In phiếu sản phẩm"
      className="[&_.ant-modal-body]:!py-4"
      footer={
        <Space>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          {!isPreviewStep && (
            <Button
              variant="primary"
              loading={previewQrCodes.isPending}
              onClick={handleConfirm}
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
            <p className="mb-2 text-sm font-medium text-slate-600">Số lượng in</p>
            <Input
              type="number"
              min={1}
              max={MAX_PRINT_QUANTITY}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="Nhập số phiếu cần in"
            />
            <p className="mt-1 text-xs text-slate-500">
              6 phiếu / trang A4. Tối đa {MAX_PRINT_QUANTITY} phiếu / lần.
            </p>
          </div>
        </div>
      ) : (
        <iframe
          ref={previewFrameRef}
          title="Xem trước phiếu in"
          srcDoc={previewHtml}
          className="h-[70vh] w-full border-0 bg-white"
        />
      )}
    </Modal>
  );
}
