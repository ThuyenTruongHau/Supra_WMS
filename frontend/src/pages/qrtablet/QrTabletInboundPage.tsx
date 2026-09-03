import { useCallback, useMemo, useState } from "react";
import { Form, Input, Modal } from "antd";
import { ScanOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Select, message } from "@/components/ui";
import { QrCameraOverlay, QrImageImport } from "@/components/qr-scan";
import CreateImportModal, {
  type ImportGroupDraft,
} from "@/pages/components/CreateImportModal";
import { useAssignOrGetItemStock } from "@/hooks/useInboundOrder";
import { getStaffUsernamesApi } from "@/api/auth";
import { getItemAvailableUnitsApi } from "@/api/itemUnit";
import { getApiErrorMessage, isQrTypeLocationConflictError } from "@/utils/apiErrorMessage";
import {
  isAssignMetaResponse,
  isQrPreviewResponse,
  type AssignedItemStock,
  type InboundCallerResponse,
  type QrCodePreviewResponse,
} from "@/types/inboundOrder";
import { sendCallerAddTasks } from "@/utils/sendCallerAddTasks";

type ScanMode = "idle" | "product" | "location";

function mapStocksToGroups(stocks: AssignedItemStock[]): ImportGroupDraft[] {
  const first = stocks[0];
  return [
    {
      key: `tablet-group-${first?.location_id ?? "loc"}`,
      from_location_id: first?.location_id ?? undefined,
      from_location_name: first?.location_name ?? undefined,
      qr_type: first?.qr_type ?? undefined,
      items: stocks.map((stock, index) => ({
        key: `tablet-item-${stock.qr_code_id}-${index}`,
        sku: stock.item_sku,
        item_id: stock.item_id,
        item_name: stock.item_name ?? undefined,
        quantity: stock.quantity,
        unit_id: stock.unit_id,
        lot_number: stock.lot_number || stock.lot_number_to || undefined,
        qr_code_id: stock.qr_code_id,
        qr_type: stock.qr_type ?? undefined,
      })),
    },
  ];
}

function isPreviewStaffFieldVisible(
  preview: QrCodePreviewResponse | null,
  field: "manufacturing_user" | "qc_user" | "packing_user",
): boolean {
  return typeof preview?.[field] === "string";
}

export default function QrTabletInboundPage() {
  const assignMutation = useAssignOrGetItemStock();
  const {
    data: staffUsernames = [],
    isLoading: staffLoading,
    isError: staffError,
  } = useQuery({
    queryKey: ["qrtablet", "staff-usernames"],
    queryFn: getStaffUsernamesApi,
    staleTime: 5 * 60 * 1000,
  });
  const staffOptions = useMemo(
    () => staffUsernames.map((name) => ({ value: name, label: name })),
    [staffUsernames],
  );
  const [scanMode, setScanMode] = useState<ScanMode>("idle");
  const [preview, setPreview] = useState<QrCodePreviewResponse | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [unitId, setUnitId] = useState<number | undefined>();
  const [lotNumber, setLotNumber] = useState("");
  const [manufacturingUser, setManufacturingUser] = useState<
    string | undefined
  >();
  const [qcUser, setQcUser] = useState<string | undefined>();
  const [packingUser, setPackingUser] = useState<string | undefined>();
  const [cavityNumber, setCavityNumber] = useState<string | undefined>();
  const [unitOptions, setUnitOptions] = useState<
    { value: number; label: string }[]
  >([]);
  const [formOpen, setFormOpen] = useState(false);
  const [importGroups, setImportGroups] = useState<ImportGroupDraft[]>();
  const [warehouseId, setWarehouseId] = useState<number | undefined>();

  const staffUsernameSet = useMemo(
    () => new Set(staffUsernames),
    [staffUsernames],
  );

  const isStaffSelected = useCallback(
    (value: string | undefined) =>
      !!value?.trim() && staffUsernameSet.has(value.trim()),
    [staffUsernameSet],
  );

  const cavityOptions = useMemo(
    () =>
      (preview?.cavity_numbers ?? []).map((c) => ({
        value: c,
        label: c,
      })),
    [preview?.cavity_numbers],
  );
  const requiresCavity = cavityOptions.length > 0;
  const showQcUser = isPreviewStaffFieldVisible(preview, "qc_user");
  const showPackingUser = isPreviewStaffFieldVisible(preview, "packing_user");

  const selectedStaff = useCallback(
    (value: string | undefined) =>
      isStaffSelected(value) ? value!.trim() : undefined,
    [isStaffSelected],
  );

  const manufacturingReady = isStaffSelected(manufacturingUser);
  const lotReady = !!lotNumber.trim();

  const resetPreview = () => {
    setPreview(null);
    setQuantity(1);
    setUnitId(undefined);
    setLotNumber("");
    setCavityNumber(undefined);
    setManufacturingUser(undefined);
    setQcUser(undefined);
    setPackingUser(undefined);
    setUnitOptions([]);
  };

  const handleProductScan = useCallback(
    async (scanned: string) => {
      setScanMode("idle");
      try {
        const result = await assignMutation.mutateAsync({ qr_code: scanned });
        if (Array.isArray(result)) {
          if (result.length === 0) {
            message.warning("Chưa có hàng được gán tại vị trí này");
            return;
          }
          setWarehouseId(result[0]?.warehouse_id ?? undefined);
          setImportGroups(mapStocksToGroups(result));
          setFormOpen(true);
          return;
        }
        if (isQrPreviewResponse(result)) {
          setPreview(result);
          setQuantity(result.quantity);
          setUnitId(result.unit_id);
          setLotNumber(result.lot_number);
          setCavityNumber(result.cavity_number ?? result.cavity_numbers?.[0]);
          setManufacturingUser(result.manufacturing_user || undefined);
          setQcUser(result.qc_user || undefined);
          setPackingUser(result.packing_user || undefined);
          setUnitOptions([
            { value: result.unit_id, label: result.unit_name },
          ]);
          try {
            const available = await getItemAvailableUnitsApi(result.item_id);
            setUnitOptions(
              available.units.map((u) => ({
                value: u.unit_id,
                label: u.unit_name,
              })),
            );
          } catch {
            // keep base unit option
          }
          return;
        }
        if (isAssignMetaResponse(result)) {
          Modal.success({
            title: "Đã gán sản phẩm",
            content: `Đã gán ${result.part_number} cho vị trí ${result.location}`,
          });
        }
      } catch (err) {
        message.error(getApiErrorMessage(err));
      }
    },
    [assignMutation],
  );

  const handleLocationScan = useCallback(
    async (scanned: string) => {
      setScanMode("idle");
      if (!preview) return;
      if (!lotReady) {
        message.warning("Hãy nhập số lô trước khi quét vị trí");
        return;
      }
      if (!manufacturingReady) {
        message.warning("Hãy chọn người sản xuất trước khi quét vị trí");
        return;
      }
      if (requiresCavity && !cavityNumber?.trim()) {
        message.warning("Hãy chọn số cavity trước khi quét vị trí");
        return;
      }
      try {
        const result = await assignMutation.mutateAsync({
          qr_code: preview.code,
          location_code: scanned,
          quantity,
          unit_id: unitId,
          lot_number: lotNumber.trim(),
          cavity_number: cavityNumber || undefined,
          manufacturing_user: selectedStaff(manufacturingUser),
          qc_user: showQcUser ? selectedStaff(qcUser) : undefined,
          packing_user: showPackingUser ? selectedStaff(packingUser) : undefined,
        });
        if (isAssignMetaResponse(result)) {
          resetPreview();
          Modal.success({
            title: "Đã gán sản phẩm",
            content: `Đã gán ${result.part_number} cho vị trí ${result.location}`,
          });
          return;
        }
        message.error("Không gán được sản phẩm cho vị trí này");
      } catch (err) {
        const errorMessage = getApiErrorMessage(err);
        if (isQrTypeLocationConflictError(err)) {
          Modal.error({
            title: "Không thể gán vị trí",
            content: errorMessage,
            centered: true,
          });
          return;
        }
        message.error(errorMessage);
      }
    },
    [
      assignMutation,
      cavityNumber,
      lotNumber,
      lotReady,
      manufacturingReady,
      manufacturingUser,
      packingUser,
      preview,
      qcUser,
      quantity,
      requiresCavity,
      showPackingUser,
      showQcUser,
      selectedStaff,
      unitId,
    ],
  );

  const handleDecoded = useCallback(
    (scanned: string) => {
      const toLocation =
        scanMode === "location" || (scanMode === "idle" && !!preview);
      if (toLocation) {
        if (!preview) {
          message.warning("Hãy quét sản phẩm trước rồi mới quét vị trí");
          return;
        }
        void handleLocationScan(scanned);
        return;
      }
      void handleProductScan(scanned);
    },
    [handleLocationScan, handleProductScan, preview, scanMode],
  );

  const renderStaffSelect = (
    label: string,
    value: string | undefined,
    onChange: (val: string | undefined) => void,
    required = false,
  ) => (
    <Form.Item label={label} required={required}>
      <Select
        className="w-full"
        allowClear
        showSearch
        optionFilterProp="label"
        loading={staffLoading}
        placeholder={
          staffError
            ? "Không tải được danh sách nhân viên"
            : "Gõ để tìm, chọn từ danh sách"
        }
        value={isStaffSelected(value) ? value : undefined}
        options={staffOptions}
        listHeight={280}
        getPopupContainer={(node) => node.parentElement ?? document.body}
        notFoundContent={
          staffLoading
            ? "Đang tải..."
            : staffError
              ? "Lỗi tải danh sách"
              : "Không tìm thấy nhân viên"
        }
        onChange={(val) => onChange(typeof val === "string" ? val : undefined)}
      />
    </Form.Item>
  );

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl rounded-2xl border border-stripe-hairline bg-white p-6 shadow-sm md:p-8">
        <h1 className="mb-2 text-center text-2xl font-extrabold text-brand-dark md:text-3xl">
          Quét QR nhập kho
        </h1>
        <p className="mb-8 text-center text-base text-stripe-ink-mute">
          Quét mã sản phẩm để gán vị trí, hoặc quét vị trí để tạo đơn nhập.
        </p>
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            icon={<ScanOutlined />}
            className="!h-14 w-full !text-lg md:!h-16 md:!text-xl"
            loading={assignMutation.isPending}
            onClick={() => setScanMode("product")}
          >
            Bắt đầu quét mã
          </Button>
          <QrImageImport onDecoded={handleDecoded} />
        </div>
      </div>

      {scanMode === "product" && (
        <QrCameraOverlay
          title="Quét mã QR"
          onScan={(text) => void handleProductScan(text)}
          onClose={() => setScanMode("idle")}
        />
      )}

      {scanMode === "location" && (
        <>
          <QrCameraOverlay
            title="Quét vị trí"
            onScan={(text) => void handleLocationScan(text)}
            onClose={() => setScanMode("idle")}
          />
          <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-brand-dark/95 px-4 py-4">
            <QrImageImport
              onDecoded={(text) => void handleLocationScan(text)}
            />
          </div>
        </>
      )}

      <Modal
        title="Xác nhận sản phẩm"
        open={!!preview && scanMode !== "location"}
        onCancel={resetPreview}
        footer={null}
        centered
        width={480}
        destroyOnHidden
      >
        {preview && (
          <Form layout="vertical" className="pt-2">
            <Form.Item label="Sản phẩm">
              <Input
                disabled
                value={`${preview.item_sku}${preview.item_name ? ` — ${preview.item_name}` : ""}`}
              />
            </Form.Item>
            <div className="mb-6 grid grid-cols-2 gap-4">
              <Form.Item label="Số lượng" required className="!mb-0">
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value) || 0)}
                />
              </Form.Item>
              <Form.Item label="Đơn vị" required className="!mb-0">
                <Select
                  className="w-full"
                  value={unitId}
                  options={unitOptions}
                  onChange={(val) => setUnitId(Number(val))}
                />
              </Form.Item>
            </div>
            {requiresCavity && (
              <Form.Item label="Số cavity" required>
                <Select
                  className="w-full"
                  value={cavityNumber}
                  options={cavityOptions}
                  placeholder="Chọn số cavity"
                  onChange={(val) =>
                    setCavityNumber(typeof val === "string" ? val : undefined)
                  }
                />
              </Form.Item>
            )}
            <Form.Item label="Số lô" required>
              <Input
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
              />
            </Form.Item>
            {renderStaffSelect(
              "Người sản xuất",
              manufacturingUser,
              setManufacturingUser,
              true,
            )}
            {showQcUser &&
              renderStaffSelect("Người kiểm tra", qcUser, setQcUser)}
            {showPackingUser &&
              renderStaffSelect("Người đóng gói", packingUser, setPackingUser)}
            <div className="flex flex-col gap-3">
              <Button
                variant="primary"
                className="!h-12 w-full !text-lg"
                disabled={
                  !quantity ||
                  !unitId ||
                  !lotReady ||
                  !manufacturingReady ||
                  (requiresCavity && !cavityNumber?.trim())
                }
                onClick={() => setScanMode("location")}
              >
                Quét vị trí
              </Button>
              <QrImageImport
                onDecoded={(text) => void handleLocationScan(text)}
              />
            </div>
          </Form>
        )}
      </Modal>

      <CreateImportModal
        open={formOpen}
        initialGroups={importGroups}
        submitMode="caller"
        lockFromLocation
        warehouseIdOverride={warehouseId}
        onCancel={() => {
          setFormOpen(false);
          setImportGroups(undefined);
        }}
        onSuccess={async (result?: InboundCallerResponse) => {
          setFormOpen(false);
          setImportGroups(undefined);
          if (result) {
            try {
              await sendCallerAddTasks(result);
              message.success("Hoàn tất đơn nhập và đã gửi task");
              return;
            } catch (err) {
              message.error(getApiErrorMessage(err));
              return;
            }
          }
          message.success("Hoàn tất đơn nhập");
        }}
      />
    </div>
  );
}
