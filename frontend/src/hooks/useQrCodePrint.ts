import { useCallback, useEffect, useRef, useState } from "react";
import type { AxiosError } from "axios";
import { message } from "@/components/ui";
import { useCreateQrCodes, usePreviewQrCodes } from "@/hooks/useItem";
import type { ApiErrorResponse } from "@/types/apiError";
import type { QrPrintType } from "@/types/item";
import { translateQrType } from "@/i18n/qrTypeLabels.vi";
import { printBacvietHtml } from "@/utils/printBacvietHtml";

export const QR_PRINT_LABELS_PER_PAGE = 9;
export const QR_PRINT_MAX_QUANTITY = 50;

export const QR_TYPE_OPTIONS: { value: QrPrintType; label: string }[] = [
  { value: "item", label: translateQrType("item") },
  { value: "transit", label: translateQrType("transit") },
  { value: "pack", label: translateQrType("pack") },
];

function getErrorMessage(err: unknown, fallback: string) {
  const detail = (err as AxiosError<ApiErrorResponse>).response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

type UseQrCodePrintOptions = {
  warehouseId: number;
  defaultItemId?: number | null;
  defaultSku?: string;
  active?: boolean;
  onPrintSuccess?: () => void;
};

export function useQrCodePrint({
  warehouseId,
  defaultItemId = null,
  defaultSku,
  active = true,
  onPrintSuccess,
}: UseQrCodePrintOptions) {
  const [selectedSku, setSelectedSku] = useState<string | undefined>();
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [qrType, setQrType] = useState<QrPrintType>("item");
  const [quantity, setQuantity] = useState(String(QR_PRINT_LABELS_PER_PAGE));
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);

  const previewQrCodes = usePreviewQrCodes();
  const createQrCodes = useCreateQrCodes();

  const resetForm = useCallback(() => {
    setSelectedSku(defaultSku);
    setSelectedItemId(defaultItemId);
    setQrType("item");
    setQuantity(String(QR_PRINT_LABELS_PER_PAGE));
    setPreviewHtml(null);
  }, [defaultItemId, defaultSku]);

  useEffect(() => {
    if (active) {
      resetForm();
    }
  }, [active, resetForm]);

  const parsedQuantity = Number.parseInt(quantity, 10);
  const isQuantityValid =
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0 &&
    parsedQuantity <= QR_PRINT_MAX_QUANTITY;

  const handleConfirm = async () => {
    if (!selectedItemId) {
      message.warning("Vui lòng chọn sản phẩm từ danh sách (bấm Tìm nếu cần)");
      return;
    }
    if (!isQuantityValid) {
      message.warning(
        `Số lượng in phải từ 1 đến ${QR_PRINT_MAX_QUANTITY}`,
      );
      return;
    }

    try {
      const result = await previewQrCodes.mutateAsync({
        itemId: selectedItemId,
        quantity: parsedQuantity,
        qrType,
      });
      setPreviewHtml(result.html);
    } catch (err) {
      message.error(getErrorMessage(err, "Không thể tạo bản xem trước"));
    }
  };

  const handlePrintRequest = useCallback(
    async (
      itemId: number,
      printQuantity: number,
      qrIds: string[],
      displayCodes: string[],
      printQrType: QrPrintType,
    ) => {
      if (createQrCodes.isPending) return;
      if (!previewHtml) {
        message.warning("Chưa có bản xem trước để in");
        return;
      }
      if (!qrIds.length || qrIds.length !== printQuantity) {
        message.warning("Thiếu metadata mã QR từ bản xem trước");
        return;
      }
      try {
        await createQrCodes.mutateAsync({
          itemId,
          quantity: printQuantity,
          qrIds,
          displayCodes,
          qrType: printQrType,
        });
        const printed = await printBacvietHtml(previewHtml);
        if (!printed) {
          message.warning("Không thể mở hộp thoại in");
          return;
        }
        onPrintSuccess?.();
      } catch (err) {
        message.error(getErrorMessage(err, "Không thể tạo mã QR để in"));
      }
    },
    [createQrCodes, onPrintSuccess, previewHtml],
  );

  useEffect(() => {
    if (!active) return;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== previewFrameRef.current?.contentWindow) return;
      if (event.data?.type !== "bacviet-qr-print") return;
      const itemId = Number(event.data.item_id);
      const printQuantity = Number(event.data.quantity);
      const qrIds = Array.isArray(event.data.qr_ids)
        ? event.data.qr_ids.map(String)
        : [];
      const displayCodes = Array.isArray(event.data.display_codes)
        ? event.data.display_codes.map(String)
        : [];
      const rawQrType = String(event.data.qr_type ?? "item");
      const printQrType: QrPrintType =
        rawQrType === "transit"
          ? "transit"
          : rawQrType === "pack"
            ? "pack"
            : "item";
      if (!itemId || !printQuantity) return;
      void handlePrintRequest(
        itemId,
        printQuantity,
        qrIds,
        displayCodes,
        printQrType,
      );
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [active, handlePrintRequest]);

  const isPreviewStep = previewHtml != null;
  const printTitle = `In ${translateQrType(qrType).toLowerCase()}`;

  return {
    warehouseId,
    selectedSku,
    setSelectedSku,
    selectedItemId,
    setSelectedItemId,
    qrType,
    setQrType,
    quantity,
    setQuantity,
    previewHtml,
    previewFrameRef,
    isPreviewStep,
    printTitle,
    isQuantityValid,
    handleConfirm,
    resetPreview: () => setPreviewHtml(null),
    resetForm,
    isPreviewPending: previewQrCodes.isPending,
    isCreatePending: createQrCodes.isPending,
  };
}
