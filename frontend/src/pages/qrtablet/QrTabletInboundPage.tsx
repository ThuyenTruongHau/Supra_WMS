import { useCallback, useMemo, useState } from "react";
import { Form, Input, Modal } from "antd";
import { ScanOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Select, message } from "@/components/ui";
import { QrCameraOverlay, QrImageImport } from "@/components/qr-scan";
import CreateImportModal, {
  type ImportGroupDraft,
} from "@/pages/components/CreateImportModal";
import { useAssignOrGetItemStock } from "@/hooks/useInboundOrder";
import { getStaffUsernamesApi } from "@/api/auth";
import { getItemAvailableUnitsApi } from "@/api/itemUnit";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";
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
      items: stocks.map((stock, index) => ({
        key: `tablet-item-${stock.qr_code_id}-${index}`,
        sku: stock.item_sku,
        item_id: stock.item_id,
        item_name: stock.item_name ?? undefined,
        quantity: stock.quantity,
        unit_id: stock.unit_id,
        lot_number: stock.lot_number || stock.lot_number_to || undefined,
        qr_code_id: stock.qr_code_id,
      })),
    },
  ];
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
  const [assignedBy, setAssignedBy] = useState<string | undefined>();
  const [staffKeyword, setStaffKeyword] = useState("");
  const [cavityNumber, setCavityNumber] = useState<string | undefined>();
  const [unitOptions, setUnitOptions] = useState<
    { value: number; label: string }[]
  >([]);
  const [formOpen, setFormOpen] = useState(false);
  const [importGroups, setImportGroups] = useState<ImportGroupDraft[]>();
  const [warehouseId, setWarehouseId] = useState<number | undefined>();

  const filteredStaffOptions = useMemo(() => {
    const keyword = staffKeyword.trim().toLowerCase();
    if (!keyword) return staffOptions;
    return staffOptions.filter((opt) =>
      opt.label.toLowerCase().includes(keyword),
    );
  }, [staffKeyword, staffOptions]);

  const cavityOptions = useMemo(
    () =>
      (preview?.cavity_numbers ?? []).map((c) => ({
        value: c,
        label: c,
      })),
    [preview?.cavity_numbers],
  );
  const requiresCavity = cavityOptions.length > 0;

  const resetPreview = () => {
    setPreview(null);
    setQuantity(1);
    setUnitId(undefined);
    setLotNumber("");
    setCavityNumber(undefined);
    setStaffKeyword("");
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
          setCavityNumber(result.cavity_numbers?.[0]);
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
      const operatorName = assignedBy?.trim();
      if (!operatorName) {
        message.warning("Hãy chọn người thực thi trước khi quét vị trí");
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
          lot_number: lotNumber || undefined,
          assigned_by: operatorName,
          cavity_number: cavityNumber || undefined,
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
        message.error(getApiErrorMessage(err));
      }
    },
    [
      assignMutation,
      assignedBy,
      cavityNumber,
      lotNumber,
      preview,
      quantity,
      requiresCavity,
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
        <QrCameraOverlay
          title="Quét vị trí"
          onScan={(text) => void handleLocationScan(text)}
          onClose={() => setScanMode("idle")}
        />
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
            <Form.Item label="Số lượng" required>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value) || 0)}
              />
            </Form.Item>
            <Form.Item label="Đơn vị" required>
              <Select
                className="w-full"
                value={unitId}
                options={unitOptions}
                onChange={(val) => setUnitId(Number(val))}
              />
            </Form.Item>
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
            <Form.Item label="Số lô">
              <Input
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
              />
            </Form.Item>
            <Form.Item label="Người thực thi" required>
              <div className="flex flex-col gap-2">
                <Input
                  allowClear
                  prefix={<SearchOutlined className="text-slate-400" />}
                  placeholder="Tìm nhân viên theo tên..."
                  value={staffKeyword}
                  onChange={(e) => setStaffKeyword(e.target.value)}
                />
                <Select
                  className="w-full"
                  allowClear
                  loading={staffLoading}
                  placeholder={
                    staffError
                      ? "Không tải được danh sách nhân viên"
                      : filteredStaffOptions.length === 0
                        ? "Không có nhân viên khớp từ khóa"
                        : "Chọn nhân viên"
                  }
                  value={assignedBy}
                  options={filteredStaffOptions}
                  listHeight={280}
                  getPopupContainer={(node) =>
                    node.parentElement ?? document.body
                  }
                  notFoundContent={
                    staffLoading
                      ? "Đang tải..."
                      : staffError
                        ? "Lỗi tải danh sách"
                        : staffKeyword.trim()
                          ? "Không tìm thấy nhân viên"
                          : "Không có nhân viên"
                  }
                  onChange={(val) =>
                    setAssignedBy(typeof val === "string" ? val : undefined)
                  }
                />
              </div>
            </Form.Item>
            <Button
              variant="primary"
              className="!h-12 w-full !text-lg"
              disabled={
                !quantity ||
                !unitId ||
                !assignedBy?.trim() ||
                (requiresCavity && !cavityNumber?.trim())
              }
              onClick={() => setScanMode("location")}
            >
              Quét vị trí
            </Button>
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
