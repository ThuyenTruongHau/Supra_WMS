/**
 * Màn chọn vị trí chia chọn — 2 map song song, double-click để vào chi tiết.
 */
import { useRef, useState, useMemo, type ChangeEvent } from "react";
import { PartitionOutlined, UploadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Button, Modal, Table, Space, message, cn } from "@/components/ui";
import {
  OPERATOR_DESKTOP,
  operatorDesktopClass,
  OPERATOR_WAVE_MAP_TUNING,
  operatorDesktopTableWidths,
} from "@/constants/operatorDesktopSizes";
import type { SortingWave } from "@/types/sortingWave";
import OutboundSortingMapCanvas from "@/components/outbound/OutboundSortingMapCanvas";
import { WAVE_STATION_LOCATION_TYPES } from "@/api/warehouseMap";
import { useSortingWaveMapContext } from "@/hooks/useSortingWaveMapContext";
import { parseMasanOutboundPreviewApi } from "@/api/masan";
import type { MasanOutboundPreviewRow } from "@/types/masan";
import { useCreateOutboundOrder } from "@/hooks/useOutbound";
import type { OutboundOrderLineItemCreate } from "@/types/outbound";
import { toDisplayInteger } from "@/utils/number";

type SortingWaveOverviewCellProps = {
  zoneId: number;
  wave: SortingWave;
  onActivate: () => void;
};

function SortingWaveOverviewCell({
  zoneId,
  wave,
  onActivate,
}: SortingWaveOverviewCellProps) {
  const { waveStationIds, stationOverlayLabels, feSimulation } =
    useSortingWaveMapContext(zoneId, wave);

  return (
    <button
      type="button"
      title={`Nhấp đúp để mở ${wave.name}`}
      aria-label={`Nhấp đúp để mở vị trí chia chọn ${wave.name}`}
      onDoubleClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter") onActivate();
      }}
      className="group relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-stripe-hairline bg-panel text-left shadow-stripe-1 transition hover:border-brand-primary/35 hover:shadow-[0_8px_28px_rgba(37,99,235,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stripe-hairline bg-panel-soft px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <PartitionOutlined className="shrink-0 text-base text-brand-primary" />
          <div className="min-w-0">
            <p className="truncate text-3xl font-extrabold text-brand-dark">
              {wave.name}
            </p>

          </div>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-300/30 bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-700 opacity-0 transition group-hover:opacity-100">
          Nhấp đúp để mở
        </span>
      </div>
      <div
        className={cn(
          "relative min-h-0 flex-1 bg-industrial-pattern p-3",
          operatorDesktopClass.boardFill,
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.06),transparent_55%)]" />
        <div className="relative h-full min-h-0 overflow-hidden rounded-lg bg-panel">
          {zoneId > 0 ? (
            <OutboundSortingMapCanvas
              key={`overview-${wave.id}-${waveStationIds.join(",")}`}
              zoneId={zoneId}
              locationType={WAVE_STATION_LOCATION_TYPES}
              locationIds={waveStationIds}
              tuning={OPERATOR_WAVE_MAP_TUNING}
              overlayLabelByCode={stationOverlayLabels}
              statusOverrideByCode={feSimulation?.statusOverrideByCode}
              className="pointer-events-none !h-full !min-h-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Chọn kho để xem bản đồ
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

type SortingWaveOverviewPickerProps = {
  zoneId: number;
  waves: SortingWave[];
  loading?: boolean;
  onSelectWave: (waveId: number) => void;
  className?: string;
};

export default function SortingWaveOverviewPicker({
  zoneId,
  waves,
  loading = false,
  onSelectWave,
  className,
}: SortingWaveOverviewPickerProps) {
  const createOutboundOrderMutation = useCreateOutboundOrder();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [importLineItems, setImportLineItems] = useState<unknown[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<
    MasanOutboundPreviewRow[]
  >([]);
  const [importWarnings, setImportWarnings] = useState<{ message: string }[]>(
    [],
  );

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

    if (zoneId <= 0) {
      message.error("Vui lòng chọn kho trước khi import");
      return;
    }

    setIsParsingExcel(true);
    resetImportState();

    try {
      const result = await parseMasanOutboundPreviewApi(file, zoneId, "auto");
      
      setImportLineItems(result.line_items);
      setImportPreviewRows(result.preview_rows);
      setImportWarnings(result.warnings.map(w => ({ message: w })));
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

    try {
      await createOutboundOrderMutation.mutateAsync({
        outboundType: "auto",
        data: {
          warehouse_id: zoneId,
          order_code: `AUTO-${Date.now()}`,
          line_items: importLineItems as OutboundOrderLineItemCreate[],
        },
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
        render: (v: string | null) => (v ? <span className="text-red-500">{v}</span> : "—"),
      },
    ],
    [importTw],
  );
  if (loading) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center rounded-xl border border-stripe-hairline bg-panel text-sm text-slate-500 shadow-stripe-1",
          className,
        )}
      >
        Đang tải vị trí chia chọn...
      </div>
    );
  }

  if (waves.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center rounded-xl border border-stripe-hairline bg-panel p-8 text-center shadow-stripe-1",
          className,
        )}
      >
        <p className="text-sm text-slate-500">
          Chưa có vị trí chia chọn trong kho này. Liên hệ admin cấu hình tại{" "}
          <span className="font-semibold text-brand-dark">Quản lý chia chọn</span>
          .
        </p>
      </div>
    );
  }

  const displayWaves = waves.slice(0, 2);

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
            Nhấp đúp vào khu vực để mở bản đồ chi tiết và danh sách xe
          </p>
        </div>
        <Button
          variant="primary"
          icon={<UploadOutlined />}
          onClick={handleImportClick}
          loading={isParsingExcel}
          disabled={zoneId <= 0}
          className="!h-10 !px-4 !text-base"
        >
          Nhập BM.04 (Masan)
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-2 lg:gap-3 lg:p-3">
        {displayWaves.map((wave) => (
          <SortingWaveOverviewCell
            key={wave.id}
            zoneId={zoneId}
            wave={wave}
            onActivate={() => onSelectWave(wave.id)}
          />
        ))}
      </div>
      <Modal
        open={isImportPreviewOpen}
        onCancel={closeImportPreview}
        width={OPERATOR_DESKTOP.modal.xl}
        title="Xem trước import Excel"
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
    </div>
  );
}
