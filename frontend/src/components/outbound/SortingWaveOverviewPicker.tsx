import React, {
  useRef,
  useState,
  useMemo,
  useCallback,
  type ChangeEvent,
} from "react";
import { EyeOutlined, PartitionOutlined, UploadOutlined } from "@ant-design/icons";
import WarehouseViewModal from "@/components/inbound/WarehouseViewModal";
import type { ColumnsType } from "antd/es/table";
import { Button, Modal, Table, Space, message, cn } from "@/components/ui";
import SortingItemsNeededModal from "@/components/outbound/SortingItemsNeededModal";
import {
  OPERATOR_DESKTOP,
  operatorDesktopClass,
  OPERATOR_WAVE_MAP_TUNING,
  operatorDesktopTableWidths,
} from "@/constants/operatorDesktopSizes";
import OperatorMapCanvas from "@/components/warehouse/OperatorMapCanvas";
import { parseMasanOutboundPreviewApi } from "@/api/masan";
import type { MasanOutboundPreviewRow } from "@/types/masan";
import { resolveOutboundType } from "@/config/warehouseMode";
import { useCreateOutboundOrder } from "@/hooks/useOutbound";
import type { OutboundOrderLineItemCreate } from "@/types/outbound";
import { buildMasanOutboundCreateRequest } from "@/utils/masanOutboundImport";
import { toDisplayInteger } from "@/utils/number";
import dayjs from "dayjs";
import type { MasanOutboundParseResponse } from "@/types/masanOutbound";
import {
  OUTBOUND_DISPLAY_ZONES,
  type OutboundDisplayZone,
} from "@/constants/outboundMapZones";
import {
  ccVehicleByCodeFromZoneLocations,
  useMasanSortingZoneCcLocations,
} from "@/hooks/useMasanSortingZoneCcLocations";

type SortingWaveOverviewCellProps = {
  zoneIds: readonly number[];
  title: string;
  onOpenSorting: () => void;
  onOpenMapDetail: () => void;
  locationSubLabelByCode?: Record<string, string>;
};

function SortingWaveOverviewCell({
  zoneIds,
  title,
  onOpenSorting,
  onOpenMapDetail,
  locationSubLabelByCode,
}: SortingWaveOverviewCellProps) {
  return (
    <div className="group relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-stripe-hairline bg-panel text-left shadow-stripe-1 transition hover:border-brand-primary/35 hover:shadow-[0_8px_28px_rgba(37,99,235,0.12)]">
      <button
        type="button"
        title={`Nhấp để chọn mã hàng · ${title}`}
        aria-label={`Chọn mã hàng xuất tại ${title}`}
        onClick={onOpenSorting}
        className="flex shrink-0 w-full items-center justify-between gap-2 border-b border-stripe-hairline bg-panel-soft px-4 py-2.5 text-left transition hover:bg-sky-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
      >
        <div className="flex min-w-0 items-center gap-2">
          <PartitionOutlined className="shrink-0 text-base text-brand-primary" />
          <div className="min-w-0">
            <p className="truncate text-3xl font-extrabold text-brand-dark">
              {title}
            </p>
            <p className="mt-0.5 text-sm font-medium text-cyan-700">
              Nhấp để chọn mã hàng xuất
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-300/30 bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-700">
          Chọn hàng
        </span>
      </button>
      <div
        className={cn(
          "relative min-h-0 flex-1 cursor-default bg-industrial-pattern p-3",
          operatorDesktopClass.boardFill,
        )}
        title={`Nhấp đúp để mở bản đồ ${title}`}
        onDoubleClick={(event) => {
          event.preventDefault();
          onOpenMapDetail();
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.06),transparent_55%)]" />
        <div className="relative h-full min-h-0 overflow-hidden rounded-lg bg-panel">
          <OperatorMapCanvas
            zoneId={[...zoneIds]}
            tuning={OPERATOR_WAVE_MAP_TUNING}
            locationSubLabelByCode={locationSubLabelByCode}
            className="pointer-events-none !h-full !min-h-0"
          />
        </div>
        <span className="pointer-events-none absolute bottom-4 right-4 rounded-md bg-white/90 px-2 py-1 text-xs font-semibold text-slate-500 opacity-0 shadow-sm transition group-hover:opacity-100">
          Nhấp đúp bản đồ để mở chi tiết
        </span>
      </div>
    </div>
  );
}

type SortingWaveOverviewPickerProps = {
  warehouseId: number;
  onSelectZone: (zoneId: number) => void;
  className?: string;
};

const DISPLAY_ZONES: OutboundDisplayZone[] = OUTBOUND_DISPLAY_ZONES;

export default React.memo(function SortingWaveOverviewPicker({
  warehouseId,
  onSelectZone,
  className,
}: SortingWaveOverviewPickerProps) {
  const createOutboundOrderMutation = useCreateOutboundOrder();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [warehouseViewOpen, setWarehouseViewOpen] = useState(false);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [importLineItems, setImportLineItems] = useState<unknown[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<
    MasanOutboundPreviewRow[]
  >([]);
  const [importWarnings, setImportWarnings] = useState<{ message: string }[]>(
    [],
  );

  const [sortingZone, setSortingZone] = useState<OutboundDisplayZone | null>(
    null,
  );
  const sortingModalOpen = sortingZone != null;

  const ccPollEnabled = warehouseId > 0;
  const ccZoneOne = useMasanSortingZoneCcLocations(
    warehouseId,
    DISPLAY_ZONES[0]?.ccBucketZoneCode ?? null,
    ccPollEnabled && Boolean(DISPLAY_ZONES[0]),
  );
  const ccZoneTwo = useMasanSortingZoneCcLocations(
    warehouseId,
    DISPLAY_ZONES[1]?.ccBucketZoneCode ?? null,
    ccPollEnabled && Boolean(DISPLAY_ZONES[1]),
  );
  const ccVehicleLabelsByDisplayZoneId = useMemo(() => {
    const map: Record<number, Record<string, string>> = {};
    const z0 = DISPLAY_ZONES[0];
    const z1 = DISPLAY_ZONES[1];
    if (z0) {
      map[z0.id] = ccVehicleByCodeFromZoneLocations(
        ccZoneOne.data?.locations ?? [],
      );
    }
    if (z1) {
      map[z1.id] = ccVehicleByCodeFromZoneLocations(
        ccZoneTwo.data?.locations ?? [],
      );
    }
    return map;
  }, [ccZoneOne.data?.locations, ccZoneTwo.data?.locations]);

  const openSortingModal = useCallback((zone: OutboundDisplayZone) => {
    if (!warehouseId) {
      message.warning("Vui lòng chọn kho trước");
      return;
    }
    setSortingZone(zone);
  }, [warehouseId]);

  const closeSortingModal = useCallback(() => {
    setSortingZone(null);
  }, []);

  const resetImportState = () => {
    setImportLineItems([]);
    setImportPreviewRows([]);
    setImportWarnings([]);
  };

  const closeImportPreview = () => {
    setIsImportPreviewOpen(false);
    resetImportState();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!warehouseId) {
      message.warning("Vui lòng chọn kho trước khi import");
      return;
    }

    setIsParsingExcel(true);
    resetImportState();

    try {
      const outboundType = resolveOutboundType(warehouseId);
      const result = await parseMasanOutboundPreviewApi(
        file,
        warehouseId,
        outboundType,
      );

      setImportLineItems(result.line_items);
      setImportPreviewRows(result.preview_rows);
      setImportWarnings(result.warnings.map((w) => ({ message: w })));
      setIsImportPreviewOpen(true);
    } catch {
      message.error("Không thể đọc file Excel (Lỗi API Masan)");
    } finally {
      setIsParsingExcel(false);
    }
  };

  const handleConfirmImport = async () => {
    if (importLineItems.length === 0) {
      message.error("Không có dữ liệu để import");
      return;
    }
    if (!warehouseId) {
      message.warning("Vui lòng chọn kho trước khi import");
      return;
    }

    try {
      const parseResult: MasanOutboundParseResponse = {
        line_items: importLineItems as OutboundOrderLineItemCreate[],
        preview_rows: importPreviewRows,
        total_rows: importPreviewRows.length,
        valid_rows: importLineItems.length,
        invalid_rows: importPreviewRows.filter((row) => row.error).length,
        warnings: importWarnings.map((w) => w.message),
      };
      const orderCode = `OUT-${dayjs().format("YYYYMMDD-HHmmss")}`;
      const outboundType = resolveOutboundType(warehouseId);
      await createOutboundOrderMutation.mutateAsync({
        outboundType,
        data: buildMasanOutboundCreateRequest(parseResult, {
          warehouseId,
          orderCode,
        }),
      });
      message.success("Import đơn xuất thành công!");
      closeImportPreview();
    } catch {
      message.error("Không thể tạo đơn xuất từ file Excel");
    }
  };

  const importTw = operatorDesktopTableWidths.outboundImportPreview;
  const importPreviewColumns: ColumnsType<MasanOutboundPreviewRow> = useMemo(
    () => [
      {
        title: "Dòng",
        dataIndex: "row_no",
        width: importTw.excelRow,
      },
      {
        title: "Xe",
        dataIndex: "vehicle_no",
        width: importTw.vehicle,
      },
      {
        title: "SKU",
        dataIndex: "sku",
        width: importTw.sku,
      },
      {
        title: "LOT",
        dataIndex: "lot_number",
        width: importTw.lot,
        render: (v: string) => v || "—",
      },
      {
        title: "SL",
        dataIndex: "quantity",
        width: importTw.qty,
        align: "right",
        render: (v: number) => toDisplayInteger(v),
      },
      {
        title: "Pallet",
        dataIndex: "pallet_count",
        width: importTw.pallet,
        align: "right",
        render: (v: string | null) => (v != null ? v : "—"),
      },
      {
        title: "Lỗi",
        dataIndex: "error",
        render: (v: string | null) =>
          v ? <span className="text-red-500">{v}</span> : "—",
      },
    ],
    [importTw],
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-stripe-hairline bg-panel shadow-stripe-1",
        className,
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleImportFileChange}
      />
      <div className="shrink-0 flex items-center justify-between border-b border-stripe-hairline px-4 py-2.5">
        <div>
          <h3 className="text-4xl font-black text-brand-dark">
            Chọn vị trí chia chọn
          </h3>
          <p className="mt-1 text-base text-stripe-ink-mute">
            Nhấp khu vực để chọn mã hàng · nhấp đúp bản đồ để mở chi tiết
          </p>
        </div>
        <Space wrap>
          <Button
            variant="secondary"
            icon={<EyeOutlined />}
            onClick={() => setWarehouseViewOpen(true)}
            disabled={warehouseId <= 0}
            className="!h-10 !px-4 !text-base"
          >
            Xem kho
          </Button>
          <Button
            variant="primary"
            icon={<UploadOutlined />}
            onClick={handleImportClick}
            loading={isParsingExcel}
            disabled={!warehouseId}
            className="!h-10 !px-4 !text-base"
          >
            Nhập phiên xuất
          </Button>
        </Space>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 @min-[1024px]:grid-cols-2 @min-[1024px]:gap-3 @min-[1024px]:p-3">
        {DISPLAY_ZONES.length > 0 ? (
          DISPLAY_ZONES.map((z) => (
            <SortingWaveOverviewCell
              key={z.id}
              zoneIds={z.zoneIds}
              title={z.name}
              onOpenSorting={() => openSortingModal(z)}
              onOpenMapDetail={() => onSelectZone(z.id)}
              locationSubLabelByCode={
                ccPollEnabled ? ccVehicleLabelsByDisplayZoneId[z.id] : undefined
              }
            />
          ))
        ) : (
          <div className="col-span-full flex items-center justify-center text-slate-500">
            Không có kho nào trong hệ thống
          </div>
        )}
      </div>

      {sortingZone && warehouseId > 0 ? (
        <SortingItemsNeededModal
          open={sortingModalOpen}
          onClose={closeSortingModal}
          warehouseId={warehouseId}
          ccBucketZoneCode={sortingZone.ccBucketZoneCode}
          title={`Chọn mã hàng — ${sortingZone.name}`}
          onConfirmExport={async (picked) => {
            console.info("[SortingExport]", {
              displayZoneId: sortingZone.id,
              ccZone: sortingZone.ccBucketZoneCode,
              itemIds: picked.map((r) => r.item_id),
              skus: picked.map((r) => r.sku),
            });
            message.success(
              `Đã xác nhận xuất mã ${picked[0]?.sku ?? ""} tại ${sortingZone.name}`,
            );
            onSelectZone(sortingZone.id);
          }}
        />
      ) : null}

      <Modal
        open={isImportPreviewOpen}
        onCancel={closeImportPreview}
        width={OPERATOR_DESKTOP.modal.xl}
        title={`Xem trước import Excel`}
        footer={
          <Space>
            <Button variant="secondary" onClick={closeImportPreview}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={createOutboundOrderMutation.isPending}
              onClick={() => void handleConfirmImport()}
            >
              Tạo đơn xuất ({importLineItems.length} nhóm)
            </Button>
          </Space>
        }
      >
        {importWarnings.length > 0 && (
          <div className="mb-4 rounded border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
            <h4 className="font-bold">Cảnh báo:</h4>
            <ul className="mt-1 list-disc pl-5">
              {importWarnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}
        <Table
          dataSource={importPreviewRows}
          columns={importPreviewColumns}
          rowKey={(r) => `${r.row_no}-${r.sku}`}
          pagination={false}
          scroll={{ y: 420 }}
          size="small"
        />
      </Modal>

      <WarehouseViewModal
        open={warehouseViewOpen}
        warehouseId={warehouseId}
        onClose={() => setWarehouseViewOpen(false)}
      />
    </div>
  );
});
