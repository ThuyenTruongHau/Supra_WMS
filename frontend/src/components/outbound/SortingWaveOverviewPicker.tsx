import React, { useRef, useState, useMemo, type ChangeEvent, useEffect } from "react";
import { PartitionOutlined, UploadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Button, Modal, Table, Space, message, cn } from "@/components/ui";
import {
  OPERATOR_DESKTOP,
  operatorDesktopClass,
  OPERATOR_WAVE_MAP_TUNING,
  operatorDesktopTableWidths,
} from "@/constants/operatorDesktopSizes";
import OperatorMapCanvas from "@/components/warehouse/OperatorMapCanvas";
import { parseMasanOutboundPreviewApi } from "@/api/masan";
import type { MasanOutboundPreviewRow } from "@/types/masan";
import { useCreateOutboundOrder } from "@/hooks/useOutbound";
import type { OutboundOrderLineItemCreate } from "@/types/outbound";
import { toDisplayInteger } from "@/utils/number";

type SortingWaveOverviewCellProps = {
  zoneId: number;
  title: string;
  onActivate: () => void;
};

function SortingWaveOverviewCell({
  zoneId,
  title,
  onActivate,
}: SortingWaveOverviewCellProps) {
  return (
    <button
      type="button"
      title={`Nhấp đúp để mở ${title}`}
      aria-label={`Nhấp đúp để mở vị trí chia chọn ${title}`}
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
              {title}
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
          <OperatorMapCanvas
            zoneId={zoneId}
            tuning={OPERATOR_WAVE_MAP_TUNING}
            className="pointer-events-none !h-full !min-h-0"
          />
        </div>
      </div>
    </button>
  );
}

type SortingWaveOverviewPickerProps = {
  onSelectZone: (zoneId: number) => void;
  className?: string;
};

const DISPLAY_ZONES = [
  { id: 12, name: "Khu vực chia chọn (Zone 12)" },
  { id: 13, name: "Khu vực xuất hàng (Zone 13)" }
];

export default React.memo(function SortingWaveOverviewPicker({
  onSelectZone,
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

  // If we don't have enough zones, fallback to the first available zone id or 0
  const defaultImportZoneId = DISPLAY_ZONES[0]?.id ?? 0;

  // Set initial selected import zone to the first available zone if not set or invalid
  const [selectedImportZoneId, setSelectedImportZoneId] = useState<number>(defaultImportZoneId);

  // Update selected zone if zones change
  useEffect(() => {
    if (DISPLAY_ZONES.length > 0 && !DISPLAY_ZONES.find(z => z.id === selectedImportZoneId)) {
      setSelectedImportZoneId(DISPLAY_ZONES[0].id);
    }
  }, [selectedImportZoneId]);


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

    setIsParsingExcel(true);
    resetImportState();

    try {
      const result = await parseMasanOutboundPreviewApi(file, selectedImportZoneId, "auto");

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
          warehouse_id: selectedImportZoneId,
          order_code: `OUT-${Date.now()}`,
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
        <div className="flex gap-2 items-center">
          <select
            className="h-10 px-3 rounded-lg border border-stripe-hairline bg-panel focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
            value={selectedImportZoneId}
            onChange={(e) => setSelectedImportZoneId(Number(e.target.value))}
          >
            {DISPLAY_ZONES.map(z => (
              <option key={z.id} value={z.id}>Import vào {z.name}</option>
            ))}
          </select>
          <Button
            variant="primary"
            icon={<UploadOutlined />}
            onClick={handleImportClick}
            loading={isParsingExcel}
            disabled={DISPLAY_ZONES.length === 0}
            className="!h-10 !px-4 !text-base"
          >
            Nhập BM.04 (Masan)
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-2 lg:gap-3 lg:p-3">
        {DISPLAY_ZONES.length > 0 ? (
          DISPLAY_ZONES.map((z) => (
            <SortingWaveOverviewCell
              key={z.id}
              zoneId={z.id}
              title={z.name}
              onActivate={() => onSelectZone(z.id)}
            />
          ))
        ) : (
          <div className="col-span-full flex items-center justify-center text-slate-500">
            Không có kho nào trong hệ thống
          </div>
        )}
      </div>
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
    </div>
  );
});
