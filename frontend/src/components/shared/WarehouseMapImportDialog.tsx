import React, { useEffect, useRef, useState } from "react";
import { Modal, Button, Alert, message } from "@/components/ui";
import { useImportWarehouseMap } from "@/hooks/useWarehouseMap";

interface WarehouseMapImportDialogProps {
  open: boolean;
  onClose: () => void;
  warehouseId: number;
}

function extractErrorDetail(error: unknown): string {
  const err = error as { response?: { data?: { detail?: unknown } } };
  const detail = err?.response?.data?.detail;

  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e: { msg?: string; loc?: string[] }) => {
        const field = e.loc?.slice(-1)[0] ?? "";
        return field ? `${field}: ${e.msg}` : (e.msg ?? "");
      })
      .filter(Boolean)
      .join("; ");
  }
  return "Không thể import warehouse map. Vui lòng thử lại.";
}

const WarehouseMapImportDialog: React.FC<WarehouseMapImportDialogProps> = ({
  open,
  onClose,
  warehouseId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { mutate, reset, isPending } = useImportWarehouseMap();

  useEffect(() => {
    if (!open) return;
    setSelectedFile(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    reset();
  }, [open, reset]);

  const resetForm = () => {
    setSelectedFile(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    reset();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      message.error("Chỉ hỗ trợ file ZIP (.zip)");
      e.target.value = "";
      setSelectedFile(null);
      return;
    }

    if (file.size === 0) {
      message.error("File ZIP trống, vui lòng chọn file khác");
      e.target.value = "";
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setErrorMsg(null);
  };

  const handleUpload = () => {
    if (!selectedFile) {
      message.warning("Vui lòng chọn file ZIP trước khi upload");
      return;
    }

    if (warehouseId <= 0) {
      message.error("Vui lòng chọn kho trước khi import");
      return;
    }

    setErrorMsg(null);
    mutate(
      { warehouseId, file: selectedFile },
      {
        onSuccess: () => {
          message.success("Import warehouse map thành công!");
          resetForm();
          onClose();
        },
        onError: (error) => {
          setErrorMsg(extractErrorDetail(error));
        },
      },
    );
  };

  const handleClose = () => {
    if (isPending) return;
    resetForm();
    onClose();
  };

  return (
    <Modal
      title="Import Warehouse Map"
      open={open}
      onCancel={handleClose}
      mask={{ closable: !isPending }}
      closable={!isPending}
      footer={
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isPending}
          >
            Hủy
          </Button>
          <Button
            variant="primary"
            onClick={handleUpload}
            loading={isPending}
            disabled={!selectedFile || isPending}
          >
            Upload
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Chọn file ZIP chứa bản đồ
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={handleFileSelect}
            disabled={isPending}
            className="
              block w-full text-sm text-slate-500
              file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
              file:text-sm file:font-semibold file:bg-brand-primary/10 file:text-brand-primary
              hover:file:bg-brand-primary/20 file:cursor-pointer file:transition-colors
              disabled:opacity-50
            "
          />
          {selectedFile && (
            <p className="mt-2 text-xs text-slate-500">
              {selectedFile.name}{" "}
              <span className="text-slate-400">
                ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            </p>
          )}
        </div>

        {errorMsg && <Alert variant="error">{errorMsg}</Alert>}

        <p className="text-xs text-slate-400">
          ZIP phải chứa file{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-500">
            compress.json
          </code>
          . Import sẽ thay thế bản đồ hiện tại của warehouse này.
        </p>
      </div>
    </Modal>
  );
};

export default WarehouseMapImportDialog;
