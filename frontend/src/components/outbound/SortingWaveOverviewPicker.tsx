import { vietnamTime } from "@/utils/vietnamTime";
import React, {
  useRef,
  useState,
  useMemo,
  useCallback,
  type ChangeEvent,
} from "react";
import OutboundAutoControl from '@/components/outbound/OutboundAutoControl';
import OutboundAutoStatus from '@/components/outbound/OutboundAutoStatus';
import { useOutboundAuto } from '@/hooks/useOutboundAuto';
import { EyeOutlined, PartitionOutlined, UploadOutlined } from "@ant-design/icons";
import WarehouseViewModal from "@/components/inbound/WarehouseViewModal";
import type { ColumnsType } from "antd/es/table";
import { Button, Modal, Table, Space, message, cn } from "@/components/ui";
import MasanVtLocationPickerModal, {
  type MasanVtLocationPick,
} from "@/components/outbound/MasanVtLocationPickerModal";
import SortingItemsNeededModal from "@/components/outbound/SortingItemsNeededModal";
import { useMasanVtLocations } from "@/hooks/useMasanVtLocations";
import { useMasanVtSortingDispatch } from "@/hooks/useMasanVtSortingDispatch";
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
import { collectMasanExcelLotErrors } from "@/utils/masanExcelLot";
import {
  collectMasanOutboundImportBlockers,
  isMasanOutboundImportBlocked,
  isMasanStockShortageWarning,
} from "@/utils/masanOutboundImportErrors";
import { MasanOutboundImportBlocker } from "@/components/outbound/MasanOutboundImportBlocker";
import { downloadMasanInboundShortageWorkbook } from "@/utils/masanInboundShortageFile";
import { toDisplayInteger } from "@/utils/number";
import type {
  MasanOutboundParseResponse,
  MasanOutboundStockShortage,
} from "@/types/masanOutbound";
import {
  OUTBOUND_DISPLAY_ZONES,
  type OutboundDisplayZone,
} from "@/constants/outboundMapZones";
import {
  ccVehicleByCodeFromZoneLocations,
  useMasanSortingZoneCcLocations,
} from "@/hooks/useMasanSortingZoneCcLocations";
import {
  operatorZoneActionButtonClass,
  operatorZoneOverviewPickRowClass,
  useOperatorViewportTier,
  type OperatorViewportTier,
} from "@/utils/operatorViewportTier";
import { useOperatorAssigneeStore } from "@/store/useOperatorAssigneeStore";
import {
  hasOutboundOperatorAssignees,
  OPERATOR_ASSIGNEE_REQUIRED_OUTBOUND,
} from "@/utils/operatorSortingPersons";

type SortingWaveOverviewCellProps = {
  warehouseId: number;
  displayZoneId: number;
  zoneIds: readonly number[];
  title: string;
  callDisabled?: boolean;
  callDisabledTitle?: string;
  onOpenSorting: () => void;
  onOpenMapDetail: () => void;
  locationSubLabelByCode?: Record<string, string>;
  viewportTier: OperatorViewportTier;
};

function SortingWaveOverviewCell({
  warehouseId,
  displayZoneId,
  zoneIds,
  title,
  callDisabled = false,
  callDisabledTitle,
  onOpenSorting,
  onOpenMapDetail,
  locationSubLabelByCode,
  viewportTier,
}: SortingWaveOverviewCellProps) {
  const auto = useOutboundAuto(warehouseId, displayZoneId);
  return (
    <div className="group relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-stripe-hairline bg-panel text-left shadow-stripe-1 transition hover:border-brand-primary/35 hover:shadow-[0_8px_28px_rgba(37,99,235,0.12)]">
      <div className="shrink-0 border-b border-stripe-hairline px-4 py-2">
        <OutboundAutoStatus warehouseId={warehouseId} displayZoneId={displayZoneId}
          renderToolbar={(toggle) => (
            <div className="flex min-w-0 items-center">
              <div className="min-w-0 flex-1">
                <OutboundAutoControl warehouseId={warehouseId} displayZoneId={displayZoneId} />
              </div>
              {toggle}
            </div>
          )}
        />
      </div>
      <button
        type="button"
        disabled={callDisabled || auto.manualBlocked}
        title={
          callDisabled && callDisabledTitle
            ? callDisabledTitle
            : `Gọi lệnh · ${title}`
        }
        aria-label={`Gọi lệnh xuất tại ${title}`}
        onClick={onOpenSorting}
        className={cn(
          "flex shrink-0 w-full items-center justify-between gap-2 border-b border-stripe-hairline bg-panel-soft px-4 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40",
          callDisabled
            ? "cursor-not-allowed opacity-55"
            : "hover:bg-sky-50/80",
          operatorZoneOverviewPickRowClass(viewportTier),
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <PartitionOutlined className="shrink-0 text-base text-brand-primary" />
          <div className="min-w-0">
            <p className="truncate text-3xl font-extrabold text-brand-dark">
              {title}
            </p>
            <p className="mt-0.5 text-sm font-medium text-cyan-700">
              Gọi lệnh — chọn VT và mã hàng
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-300/30 bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-700">
          Gọi lệnh
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
  const viewportTier = useOperatorViewportTier();
  const outboundByDisplayZoneId = useOperatorAssigneeStore(
    (s) => s.outboundByDisplayZoneId,
  );
  const createOutboundOrderMutation = useCreateOutboundOrder();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [warehouseViewOpen, setWarehouseViewOpen] = useState(false);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [importLineItems, setImportLineItems] = useState<unknown[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<
    MasanOutboundPreviewRow[]
  >([]);
  const [importBlockerDialog, setImportBlockerDialog] = useState<{
    lines: string[];
    shortages: MasanOutboundStockShortage[];
    allowProceed: boolean;
  } | null>(null);
  const [pendingShortageParse, setPendingShortageParse] =
    useState<MasanOutboundParseResponse | null>(null);
  const [lastParseAllowed, setLastParseAllowed] = useState(true);

  const [sortingZone, setSortingZone] = useState<OutboundDisplayZone | null>(
    null,
  );
  const [dispatchVt, setDispatchVt] = useState<MasanVtLocationPick | null>(
    null,
  );
  const dispatchDisplayZoneId = sortingZone?.id ?? 0;
  const {
    locations: vtLocationsForDispatch,
    vtZoneIds: dispatchVtZoneIds,
    isLoading: vtLocationsLoading,
    failedZoneIds: vtLocationFailedZoneIds,
  } = useMasanVtLocations(dispatchDisplayZoneId);
  const runVtSortingDispatch = useMasanVtSortingDispatch(
    dispatchDisplayZoneId,
    warehouseId,
  );

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

  const openSortingModal = useCallback(
    (zone: OutboundDisplayZone) => {
      if (!warehouseId) {
        message.warning("Vui lòng chọn kho trước");
        return;
      }
      if (
        !hasOutboundOperatorAssignees(outboundByDisplayZoneId[zone.id])
      ) {
        message.warning(OPERATOR_ASSIGNEE_REQUIRED_OUTBOUND);
        return;
      }
      setDispatchVt(null);
      setSortingZone(zone);
    },
    [warehouseId, outboundByDisplayZoneId],
  );

  const closeDispatchFlow = useCallback(() => {
    setSortingZone(null);
    setDispatchVt(null);
  }, []);

  const handleVtPickerSelect = useCallback((pick: MasanVtLocationPick) => {
    setDispatchVt(pick);
  }, []);

  const resetImportState = () => {
    setIsImportPreviewOpen(false);
    setImportBlockerDialog(null);
    setPendingShortageParse(null);
    setLastParseAllowed(true);
    setImportLineItems([]);
    setImportPreviewRows([]);
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

      const lotErrors = collectMasanExcelLotErrors(result.preview_rows);
      if (lotErrors.length > 0) {
        Modal.error({
          title: "LOT không hợp lệ (DDMMYY 6 chữ số)",
          width: OPERATOR_DESKTOP.modal.sm,
          destroyOnHidden: true,
          content: (
            <ul
              className={`mt-2 ${operatorDesktopClass.listMax64} list-disc space-y-1 overflow-y-auto pl-5 text-sm`}
            >
              {lotErrors.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ),
        });
        return;
      }

      if (isMasanStockShortageWarning(result)) {
        const shortages = result.stock_shortages ?? [];
        downloadMasanInboundShortageWorkbook(shortages);
        setPendingShortageParse(result);
        setImportBlockerDialog({
          lines: [],
          shortages,
          allowProceed: true,
        });
        return;
      }

      if (isMasanOutboundImportBlocked(result)) {
        const importBlockers = collectMasanOutboundImportBlockers(result);
        setImportBlockerDialog({
          lines:
            importBlockers.length > 0
              ? importBlockers
              : ["Không thể import file Excel."],
          shortages: result.stock_shortages ?? [],
          allowProceed: false,
        });
        return;
      }

      setLastParseAllowed(result.can_import !== false);
      setImportLineItems(result.line_items);
      setImportPreviewRows(result.preview_rows);
      setIsImportPreviewOpen(true);
    } catch {
      message.error("Không thể đọc file Excel (Lỗi API Masan)");
    } finally {
      setIsParsingExcel(false);
    }
  };

  const handleProceedAfterShortage = () => {
    const result = pendingShortageParse;
    if (!result?.line_items?.length) {
      message.error("Không có dữ liệu để tạo phiên xuất");
      return;
    }
    setImportBlockerDialog(null);
    setPendingShortageParse(null);
    setLastParseAllowed(true);
    setImportLineItems(result.line_items);
    setImportPreviewRows(result.preview_rows);
    setIsImportPreviewOpen(true);
  };

  const handleConfirmImport = async () => {
    if (!lastParseAllowed) {
      message.error("File import bị chặn do lỗi tồn/Locator");
      return;
    }
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
        warnings: [],
      };
      const orderCode = `OUT-${vietnamTime().format("YYYYMMDD-HHmmss")}`;
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
        </div>
        <Space wrap>
          <Button
            variant="secondary"
            icon={<EyeOutlined />}
            onClick={() => setWarehouseViewOpen(true)}
            disabled={warehouseId <= 0}
            className={operatorZoneActionButtonClass(viewportTier)}
          >
            Xem kho
          </Button>
          <Button
            variant="primary"
            icon={<UploadOutlined />}
            onClick={handleImportClick}
            loading={isParsingExcel}
            disabled={!warehouseId}
            className={operatorZoneActionButtonClass(viewportTier)}
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
              warehouseId={warehouseId}
              displayZoneId={z.id}
              zoneIds={z.zoneIds}
              title={z.name}
              viewportTier={viewportTier}
              callDisabled={
                !hasOutboundOperatorAssignees(outboundByDisplayZoneId[z.id])
              }
              callDisabledTitle={OPERATOR_ASSIGNEE_REQUIRED_OUTBOUND}
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
        <MasanVtLocationPickerModal
          open={dispatchVt == null}
          onClose={closeDispatchFlow}
          title={`Gọi lệnh — ${sortingZone.name}`}
          subtitle={`CC Masan: ${sortingZone.ccBucketZoneCode}`}
          locations={vtLocationsForDispatch}
          vtZoneIds={dispatchVtZoneIds}
          isLoading={vtLocationsLoading}
          failedZoneIds={vtLocationFailedZoneIds}
          onSelect={handleVtPickerSelect}
        />
      ) : null}
      {sortingZone && warehouseId > 0 && dispatchVt ? (
        <SortingItemsNeededModal
          open
          onClose={closeDispatchFlow}
          warehouseId={warehouseId}
          ccBucketZoneCode={sortingZone.ccBucketZoneCode}
          sortingZoneCode={sortingZone.vtSortingZoneCode}
          title={`Chọn mã hàng — ${dispatchVt.locationName}`}
          subtitle={`${sortingZone.name} · VT ${dispatchVt.locationName}`}
          vtLocationId={dispatchVt.locationId}
          onConfirmExport={async (picked, options) => {
            await runVtSortingDispatch(
              picked,
              dispatchVt.locationId,
              options?.vehicleNo,
            );
            closeDispatchFlow();
            onSelectZone(sortingZone.id);
          }}
        />
      ) : null}

      <Modal
        open={importBlockerDialog != null}
        onCancel={() => setImportBlockerDialog(null)}
        width={OPERATOR_DESKTOP.modal.sm}
        zIndex={2100}
        title={
          importBlockerDialog?.allowProceed
            ? "Xác nhận import"
            : "Không thể import — lỗi tồn / Locator"
        }
        footer={
          <Space>
            <Button
              variant="secondary"
              onClick={() => {
                setImportBlockerDialog(null);
                setPendingShortageParse(null);
              }}
            >
              Hủy
            </Button>
            {importBlockerDialog?.allowProceed ? (
              <Button variant="primary" onClick={handleProceedAfterShortage}>
                Xác nhận
              </Button>
            ) : null}
          </Space>
        }
      >
        {importBlockerDialog ? (
          <MasanOutboundImportBlocker
            lines={importBlockerDialog.lines}
            shortages={importBlockerDialog.shortages}
            confirmOnly={importBlockerDialog.allowProceed}
            listClassName={`mt-2 ${operatorDesktopClass.listMax64} list-disc space-y-1 overflow-y-auto pl-5 text-sm`}
          />
        ) : null}
      </Modal>

      <Modal
        open={isImportPreviewOpen}
        onCancel={closeImportPreview}
        width={OPERATOR_DESKTOP.modal.xl}
        zIndex={2000}
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
