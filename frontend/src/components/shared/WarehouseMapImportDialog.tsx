import React, { useRef, useState } from "react";
import { Modal, Button, Alert, message } from "@/components/ui";
import { useImportWarehouseMap } from "@/hooks/useWarehouseMap";

interface WarehouseMapImportDialogProps {
  open: boolean;
  onClose: () => void;
  zoneId: number;
}

/**
 * Extracts a human-readable error message from an Axios error response.
 * Supports both `detail: string` and `detail: array` (FastAPI validation errors).
 */
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
  zoneId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const importMutation = useImportWarehouseMap();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setErrorMsg(null);
  };

  const handleUpload = () => {
    if (!selectedFile) return;

    setErrorMsg(null);
    importMutation.mutate(
      { zoneId, file: selectedFile },
      {
        onSuccess: () => {
          message.success("Import warehouse map thành công!");
          handleClose();
        },
        onError: (error) => {
          setErrorMsg(extractErrorDetail(error));
        },
      },
    );
  };

  const handleClose = () => {
    if (importMutation.isPending) return; // Prevent close while uploading
    setSelectedFile(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    importMutation.reset();
    onClose();
  };

  return (
    <Modal
      title="Import Warehouse Map"
      open={open}
      onCancel={handleClose}
      mask={{ closable: !importMutation.isPending }}
      closable={!importMutation.isPending}
      footer={
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={importMutation.isPending}
          >
            Hủy
          </Button>
          <Button
            variant="primary"
            onClick={handleUpload}
            loading={importMutation.isPending}
            disabled={!selectedFile || importMutation.isPending}
          >
            Upload
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Zone info */}
        <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
          <span className="text-xs text-slate-500 block mb-1">
            Zone đang chọn
          </span>
          <span className="font-semibold text-slate-700">Zone {zoneId}</span>
        </div>

        {/* File picker */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Chọn file ZIP chứa bản đồ
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            disabled={importMutation.isPending}
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
              📦 {selectedFile.name}{" "}
              <span className="text-slate-400">
                ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            </p>
          )}
        </div>

        {/* Error message */}
        {errorMsg && <Alert variant="error">{errorMsg}</Alert>}

        {/* Hint */}
        <p className="text-xs text-slate-400">
          ZIP phải chứa file{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-500">
            compress.json
          </code>
          . Import sẽ thay thế bản đồ hiện tại của zone này.
        </p>
      </div>
    </Modal>
  );
};

export default WarehouseMapImportDialog;
