import { useEffect, useMemo, useState } from "react";
import { FilePdfOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Radio } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Button, Modal, Table, cn } from "@/components/ui";
import {
  createMasanPickingListPdfApi,
  downloadMasanPickingListPdfApi,
  listMasanPickingListsApi,
} from "@/api/masan";
import type {
  MasanPickingListAvailableLine,
  MasanPickingListSummary,
} from "@/types/masan";
import { message } from "@/components/ui/message";
import { toDisplayInteger } from "@/utils/number";

type Props = {
  open: boolean;
  warehouseId: number;
  vehicleNo: string;
  locationId?: number | null;
  onClose: () => void;
  /** Gọi sau khi tạo/tải PDF thành công (refetch bảng operator / map CC). */
  onDownloadComplete?: () => void | Promise<void>;
  zIndex?: number;
};

function displayVehicle(vehicleNo: string): string {
  return vehicleNo === "no_vehicle" ? "Chưa gán xe" : vehicleNo;
}

async function readAxiosErrorDetail(err: unknown): Promise<string> {
  if (
    err &&
    typeof err === "object" &&
    "response" in err &&
    err.response &&
    typeof err.response === "object" &&
    "data" in err.response
  ) {
    const data = (err.response as { data?: unknown }).data;
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        const json = JSON.parse(text) as { detail?: string };
        if (json.detail) return json.detail;
      } catch {
        /* ignore */
      }
    }
    if (data && typeof data === "object" && "detail" in data) {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === "string") return detail;
    }
  }
  return "Lỗi tải PDF";
}

export default function MasanPickingListModal({
  open,
  warehouseId,
  vehicleNo,
  locationId = null,
  onClose,
  onDownloadComplete,
  zIndex,
}: Props) {
  const [createNew, setCreateNew] = useState(true);
  const [selectedExtracted, setSelectedExtracted] = useState<number | null>(
    null,
  );
  const [selectedDetailIds, setSelectedDetailIds] = useState<number[]>([]);
  const [downloading, setDownloading] = useState(false);

  const vehicle = vehicleNo.trim();
  const listQuery = useQuery({
    queryKey: ["masanPickingLists", warehouseId, vehicle, locationId],
    queryFn: () => listMasanPickingListsApi(warehouseId, vehicle, locationId),
    enabled: open && warehouseId > 0 && vehicle.length > 0,
  });

  const items: MasanPickingListSummary[] = listQuery.data?.items ?? [];
  const availableLines: MasanPickingListAvailableLine[] =
    listQuery.data?.available_lines ?? [];

  useEffect(() => {
    if (!open) return;
    setCreateNew(true);
    setSelectedExtracted(null);
    setSelectedDetailIds([]);
  }, [open, vehicle]);

  const hasLineSelection = selectedDetailIds.length > 0;

  const canDownload = useMemo(() => {
    if (hasLineSelection) return true;
    if (createNew) return true;
    return selectedExtracted != null;
  }, [hasLineSelection, createNew, selectedExtracted]);

  const lineColumns: ColumnsType<MasanPickingListAvailableLine> = useMemo(
    () => [
      {
        title: "SKU",
        dataIndex: "sku",
        width: 100,
        ellipsis: true,
      },
      {
        title: "Tên hàng",
        dataIndex: "item_name",
        ellipsis: true,
      },
      {
        title: "Khách hàng",
        dataIndex: "customer_name",
        width: 120,
        ellipsis: true,
        render: (v: string) => v?.trim() || "—",
      },
      {
        title: "SL",
        dataIndex: "quantity",
        width: 56,
        align: "right",
        render: (v: number) => toDisplayInteger(v),
      },
      {
        title: "Lượt in",
        dataIndex: "extracted",
        width: 72,
        align: "center",
        render: (v: number) => (v > 0 ? `#${v}` : "—"),
      },
    ],
    [],
  );

  const handleDownload = async () => {
    if (!canDownload) return;
    setDownloading(true);
    try {
      if (hasLineSelection) {
        await createMasanPickingListPdfApi({
          warehouse_id: warehouseId,
          vehicle_no: vehicle,
          detail_ids: selectedDetailIds,
          ...(locationId != null ? { location_id: locationId } : {}),
        });
        message.success("Đã tải picking list PDF (in chọn lọc, không gán lượt in).");
      } else if (createNew) {
        await createMasanPickingListPdfApi({
          warehouse_id: warehouseId,
          vehicle_no: vehicle,
          ...(locationId != null ? { location_id: locationId } : {}),
        });
        message.success("Đã tạo và tải picking list PDF.");
        await listQuery.refetch();
      } else if (selectedExtracted != null) {
        await downloadMasanPickingListPdfApi({
          warehouse_id: warehouseId,
          vehicle_no: vehicle,
          extracted: selectedExtracted,
          ...(locationId != null ? { location_id: locationId } : {}),
        });
        message.success("Đã tải picking list PDF.");
      }
      await onDownloadComplete?.();
      onClose();
    } catch (err: unknown) {
      message.error(await readAxiosErrorDetail(err));
    } finally {
      setDownloading(false);
    }
  };

  const batchSelectionDisabled = hasLineSelection;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Picking list (PDF)"
      width={720}
      zIndex={zIndex}
      getContainer={() => document.body}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button
            variant="primary"
            icon={<FilePdfOutlined />}
            loading={downloading}
            disabled={!canDownload}
            onClick={() => void handleDownload()}
          >
            Tải PDF
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Xe:{" "}
        <span className="font-semibold text-brand-dark">
          {displayVehicle(vehicle)}
        </span>
      </p>

      <div
        role="button"
        tabIndex={batchSelectionDisabled ? -1 : 0}
        className={cn(
          "mb-4 rounded-lg border border-stripe-hairline bg-panel-soft p-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40",
          batchSelectionDisabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer",
        )}
        onClick={() => {
          if (batchSelectionDisabled) return;
          setCreateNew(true);
          setSelectedExtracted(null);
        }}
        onKeyDown={(e) => {
          if (batchSelectionDisabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCreateNew(true);
            setSelectedExtracted(null);
          }
        }}
      >
        <Radio checked={createNew && !hasLineSelection} className="pointer-events-none">
          Tạo picking list mới
        </Radio>
        <p className="ml-6 mt-1 text-xs text-slate-500">
          Gán lượt in mới cho các dòng chưa in (extracted = 0). Một file PDF,
          mỗi khách hàng một tờ.
        </p>
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Đã tạo trước đó
      </div>
      {listQuery.isLoading ? (
        <p className="text-sm text-slate-500">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">Chưa có picking list nào.</p>
      ) : (
        <ul className="mb-4 max-h-40 space-y-2 overflow-y-auto">
          {items.map((row) => (
            <li key={row.extracted}>
              <div
                role="button"
                tabIndex={batchSelectionDisabled ? -1 : 0}
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40",
                  batchSelectionDisabled
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer",
                  !createNew &&
                    !hasLineSelection &&
                    selectedExtracted === row.extracted
                    ? "border-brand-primary bg-brand-primary/5"
                    : "border-stripe-hairline",
                )}
                onClick={() => {
                  if (batchSelectionDisabled) return;
                  setCreateNew(false);
                  setSelectedExtracted(row.extracted);
                  setSelectedDetailIds([]);
                }}
                onKeyDown={(e) => {
                  if (batchSelectionDisabled) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setCreateNew(false);
                    setSelectedExtracted(row.extracted);
                    setSelectedDetailIds([]);
                  }
                }}
              >
                <Radio
                  checked={
                    !createNew &&
                    !hasLineSelection &&
                    selectedExtracted === row.extracted
                  }
                  className="pointer-events-none"
                />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-brand-dark">
                    Lượt #{row.extracted} · {row.line_count} dòng
                    {row.customer_count != null && row.customer_count > 0
                      ? ` · ${row.customer_count} khách`
                      : ""}
                  </p>
                  <p className="text-slate-500">
                    {row.assigned_location || "—"} · {row.zone || "—"}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Chọn dòng in (tùy chọn)
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="!h-8 !text-xs"
            disabled={availableLines.length === 0}
            onClick={() =>
              setSelectedDetailIds(availableLines.map((row) => row.detail_id))
            }
          >
            Chọn tất cả
          </Button>
          <Button
            variant="secondary"
            className="!h-8 !text-xs"
            disabled={selectedDetailIds.length === 0}
            onClick={() => setSelectedDetailIds([])}
          >
            Bỏ chọn
          </Button>
        </div>
      </div>
      <p className="mb-2 text-xs text-slate-500">
        Tick dòng = in PDF không gán lượt in. Không tick + &quot;Tạo mới&quot; =
        gán lượt cho dòng chưa in.
      </p>
      <Table<MasanPickingListAvailableLine>
        size="small"
        bordered
        loading={listQuery.isLoading}
        dataSource={availableLines}
        columns={lineColumns}
        rowKey="detail_id"
        pagination={false}
        scroll={{ y: 220, x: 640 }}
        locale={{ emptyText: "Không có dòng completed cho xe này." }}
        rowSelection={{
          selectedRowKeys: selectedDetailIds,
          onChange: (keys) => {
            setSelectedDetailIds(keys.map((key) => Number(key)));
          },
        }}
      />
    </Modal>
  );
}
