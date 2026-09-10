import Hero from "@/components/shared/Hero";
import { SkuSearchSelect } from "@/components/shared/SkuSearchSelect";
import { Button, Card, Input, Select } from "@/components/ui";
import {
  QR_PRINT_LABELS_PER_PAGE,
  QR_PRINT_MAX_QUANTITY,
  QR_TYPE_OPTIONS,
  useQrCodePrint,
} from "@/hooks/useQrCodePrint";
import { useAppStore } from "@/store/useAppStore";

const SKU_BROWSE_PAGE_SIZE = 20;

export default function QrTabletPrintQrPage() {
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId);
  const warehouseId = selectedWarehouseId ?? 0;

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
    handleConfirm,
    resetPreview,
    isPreviewPending,
  } = useQrCodePrint({
    warehouseId,
    active: warehouseId > 0,
    onPrintSuccess: () => resetPreview(),
  });

  return (
    <div className="space-y-4 md:space-y-6">
      <Hero title="In mã QR" />

      {warehouseId <= 0 ? (
        <Card>
          <div className="py-12 text-center text-slate-400 italic">
            Vui lòng chọn kho để in mã QR
          </div>
        </Card>
      ) : !isPreviewStep ? (
        <Card>
          <div className="space-y-5">
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
                className="w-full !h-11"
                value={qrType}
                options={QR_TYPE_OPTIONS}
                onChange={(value) => setQrType(value as typeof qrType)}
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
                className="!h-11"
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="Nhập số phiếu cần in"
              />
              <p className="mt-1 text-xs text-slate-500">
                {QR_PRINT_LABELS_PER_PAGE} phiếu / trang A4. Tối đa{" "}
                {QR_PRINT_MAX_QUANTITY} phiếu / lần.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                className="!h-11 min-w-[140px]"
                loading={isPreviewPending}
                onClick={() => void handleConfirm()}
              >
                Xem trước & In
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="text-base font-semibold text-brand-dark">
              Xem trước phiếu in
            </h3>
            <Button variant="secondary" className="!h-10" onClick={resetPreview}>
              Quay lại
            </Button>
          </div>
          <iframe
            ref={previewFrameRef}
            title="Xem trước phiếu in"
            srcDoc={previewHtml ?? undefined}
            className="h-[70vh] w-full border-0 bg-white"
          />
        </Card>
      )}
    </div>
  );
}
