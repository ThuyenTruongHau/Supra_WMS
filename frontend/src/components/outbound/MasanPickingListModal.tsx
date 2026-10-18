import { useEffect, useMemo, useState } from "react";
import { FilePdfOutlined } from "@ant-design/icons";
import { Radio } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Button, Modal, cn } from "@/components/ui";
import {
  createMasanPickingListPdfApi,
  downloadMasanPickingListPdfApi,
  listMasanPickingListsApi,
} from "@/api/masan";
import type { MasanPickingListSummary } from "@/types/masan";
import { message } from "@/components/ui/message";

type Props = {
  open: boolean;
  warehouseId: number;
  vehicleNo: string;
  locationId?: number | null;
  onClose: () => void;
  /** Gọi sau khi tạo/tải PDF thành công (refetch bảng operator / map CC). */
  onDownloadComplete?: () => void | Promise<void>;
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
}: Props) {
  const [createNew, setCreateNew] = useState(true);
  const [selectedExtracted, setSelectedExtracted] = useState<number | null>(
    null,
  );
  const [downloading, setDownloading] = useState(false);

  const vehicle = vehicleNo.trim();
  const listQuery = useQuery({
    queryKey: ["masanPickingLists", warehouseId, vehicle],
    queryFn: () => listMasanPickingListsApi(warehouseId, vehicle),
    enabled: open && warehouseId > 0 && vehicle.length > 0,
  });

  const items: MasanPickingListSummary[] = listQuery.data?.items ?? [];

  useEffect(() => {
    if (!open) return;
    setCreateNew(true);
    setSelectedExtracted(null);
  }, [open, vehicle]);

  const canDownload = useMemo(() => {
    if (createNew) return true;
    return selectedExtracted != null;
  }, [createNew, selectedExtracted]);

  const handleDownload = async () => {
    if (!canDownload) return;
    setDownloading(true);
    try {
      if (createNew) {
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

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Picking list (PDF)"
      width={520}
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
        tabIndex={0}
        className="mb-4 cursor-pointer rounded-lg border border-stripe-hairline bg-panel-soft p-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
        onClick={() => {
          setCreateNew(true);
          setSelectedExtracted(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCreateNew(true);
            setSelectedExtracted(null);
          }
        }}
      >
        <Radio checked={createNew} className="pointer-events-none">
          Tạo picking list mới
        </Radio>
        <p className="ml-6 mt-1 text-xs text-slate-500">
          Gán lượt in mới cho các dòng chưa in (extracted = 0).
        </p>
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Đã tạo trước đó
      </div>
      {listQuery.isLoading ? (
        <p className="text-sm text-slate-500">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có picking list nào.</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {items.map((row) => (
            <li key={row.extracted}>
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40",
                  !createNew && selectedExtracted === row.extracted
                    ? "border-brand-primary bg-brand-primary/5"
                    : "border-stripe-hairline",
                )}
                onClick={() => {
                  setCreateNew(false);
                  setSelectedExtracted(row.extracted);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setCreateNew(false);
                    setSelectedExtracted(row.extracted);
                  }
                }}
              >
                <Radio
                  checked={!createNew && selectedExtracted === row.extracted}
                  className="pointer-events-none"
                />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-brand-dark">
                    Lượt #{row.extracted} · {row.line_count} dòng
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
      {createNew && items.length > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          Bật &quot;Tạo mới&quot; sẽ bỏ chọn các lượt cũ ở trên.
        </p>
      ) : null}
    </Modal>
  );
}
