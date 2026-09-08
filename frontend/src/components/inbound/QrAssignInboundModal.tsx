import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  CameraOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  InfoCircleOutlined,
  EditOutlined,
  LeftOutlined,
  LoadingOutlined,
  ScanOutlined,
} from "@ant-design/icons";
import { Button, Modal, cn, message } from "@/components/ui";
import { useAssignInboundToBuffer } from "@/hooks/useInbound";
import type { InboundAssignedDetail } from "@/types/inbound";
import type { WarehouseLocation } from "@/types/warehouseLocation";
import { toDisplayInteger } from "@/utils/number";

type Props = {
  open: boolean;
  orderId: number;
  assignedDetails: InboundAssignedDetail[];
  locationByCode: Record<string, WarehouseLocation>;
  onClose: () => void;
};

type ScanStep = "pallet" | "location";

export default function QrAssignInboundModal({
  open,
  orderId,
  assignedDetails,
  locationByCode,
  onClose,
}: Props) {
  const [scanStep, setScanStep] = useState<ScanStep>("pallet");
  const [isManualInput, setIsManualInput] = useState(false);
  
  // Scanned / Selected entities
  const [selectedDetail, setSelectedDetail] = useState<InboundAssignedDetail | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<WarehouseLocation | null>(null);

  // Manual input values
  const [manualPalletVal, setManualPalletVal] = useState("");
  const [manualLocationVal, setManualLocationVal] = useState("");

  // UI feedback states
  const [flashState, setFlashState] = useState<"success" | "error" | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);

  // Refs
  const qrCodeRef = useRef<Html5Qrcode | null>(null);
  const palletInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);

  const assignMutation = useAssignInboundToBuffer();

  // Play standard warehouse beeps using Web Audio API
  const playBeep = (type: "success" | "error") => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "success") {
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.stop(ctx.currentTime + 0.12);
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, ctx.currentTime); // Low buzz
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {
      console.warn("Audio playback failed", e);
    }
  };

  const handleFlash = (status: "success" | "error") => {
    setFlashState(status);
    playBeep(status);
    const timer = setTimeout(() => {
      setFlashState(null);
    }, 800);
    return () => clearTimeout(timer);
  };

  // Reset local states
  const resetForm = () => {
    setSelectedDetail(null);
    setSelectedLocation(null);
    setManualPalletVal("");
    setManualLocationVal("");
    setScanStep("pallet");
  };

  // Process Pallet/Detail ID QR Code scan
  const processPalletScan = (scannedText: string) => {
    const rawVal = scannedText.trim();
    if (!rawVal) return;

    // 1. Try to match as Detail ID directly (integer)
    let parsedId = parseInt(rawVal, 10);
    let matchedDetail: InboundAssignedDetail | undefined;

    if (!isNaN(parsedId) && String(parsedId) === rawVal) {
      matchedDetail = assignedDetails.find(
        (d) => d.detail_id === parsedId && d.status !== "completed",
      );
    }

    // 2. If not matched, try matching product_sku case-insensitively
    if (!matchedDetail) {
      // Find first pending detail of this SKU
      matchedDetail = assignedDetails.find(
        (d) =>
          d.product_sku?.trim().toUpperCase() === rawVal.toUpperCase() &&
          d.status !== "completed" &&
          !d.location_code, // Prefer unassigned ones
      );
    }

    // 3. Fallback to check SKU match even if already assigned
    if (!matchedDetail) {
      matchedDetail = assignedDetails.find(
        (d) =>
          d.product_sku?.trim().toUpperCase() === rawVal.toUpperCase() &&
          d.status !== "completed",
      );
    }

    if (matchedDetail) {
      setSelectedDetail(matchedDetail);
      handleFlash("success");
      setScanStep("location");
      setManualPalletVal("");
      // Focus location input next frame if manual mode
      if (isManualInput) {
        setTimeout(() => locationInputRef.current?.focus(), 50);
      }
    } else {
      handleFlash("error");
      message.error(`Không tìm thấy Pallet hoặc SKU "${rawVal}" chưa gán.`);
      setManualPalletVal("");
    }
  };

  // Process Location QR Code scan (e.g. "CN01")
  const processLocationScan = (scannedText: string) => {
    const rawVal = scannedText.trim().toUpperCase();
    if (!rawVal) return;

    const matchedLoc = locationByCode[rawVal];
    if (matchedLoc) {
      setSelectedLocation(matchedLoc);
      
      // Auto-trigger assignment if detail is selected
      if (selectedDetail) {
        handleConfirmAssign(selectedDetail.detail_id, matchedLoc.id, rawVal);
      } else {
        handleFlash("success");
        setScanStep("pallet");
        setManualLocationVal("");
      }
    } else {
      handleFlash("error");
      message.error(`Không tìm thấy ô chứa có mã "${rawVal}"`);
      setManualLocationVal("");
    }
  };

  // Handle final API call to map them
  const handleConfirmAssign = (detailId: number, locId: number, locCode: string) => {
    assignMutation.mutate(
      {
        orderId,
        data: {
          location_id: locId,
          detail_id: detailId,
        },
      },
      {
        onSuccess: () => {
          handleFlash("success");
          message.success(`Đã gán lệnh #${detailId} vào ô ${locCode} thành công!`);
          resetForm();
          // Keep manual focus in loop
          if (isManualInput) {
            setTimeout(() => palletInputRef.current?.focus(), 50);
          }
        },
        onError: (err) => {
          handleFlash("error");
          const errorMsg =
            err.response?.data?.detail ?? "Không thể gán hàng vào ô chứa";
          message.error(errorMsg);
        },
      },
    );
  };

  // Handle camera scanning cycle
  useEffect(() => {
    if (!open || isManualInput) {
      stopCamera();
      return;
    }

    const startCamera = async () => {
      try {
        setIsCameraActive(false);
        setCameraErrorMsg(null);

        // Allow some DOM render time
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        const html5QrCode = new Html5Qrcode("qr-reader-container");
        qrCodeRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (width, height) => {
              const minDim = Math.min(width, height);
              return { width: minDim * 0.72, height: minDim * 0.72 };
            },
          },
          (decodedText) => {
            // Trigger scan handler based on active step
            if (scanStep === "pallet") {
              processPalletScan(decodedText);
            } else if (scanStep === "location") {
              processLocationScan(decodedText);
            }
          },
          () => {
            // silent scan fail logs to prevent console pollution
          },
        );

        setIsCameraActive(true);
      } catch (err) {
        console.error("Camera error:", err);
        setCameraErrorMsg(
          "Không thể truy cập camera. Vui lòng cấp quyền hoặc chuyển sang chế độ Nhập tay.",
        );
        setIsCameraActive(false);
      }
    };

    void startCamera();

    return () => {
      stopCamera();
    };
  }, [open, isManualInput, scanStep]);

  const stopCamera = () => {
    if (qrCodeRef.current) {
      if (qrCodeRef.current.isScanning) {
        qrCodeRef.current
          .stop()
          .then(() => {
            qrCodeRef.current?.clear();
            qrCodeRef.current = null;
            setIsCameraActive(false);
          })
          .catch((err) => console.error("Error stopping html5-qrcode", err));
      } else {
        qrCodeRef.current = null;
        setIsCameraActive(false);
      }
    }
  };

  // Focus manual input fields
  useEffect(() => {
    if (open && isManualInput) {
      if (scanStep === "pallet") {
        palletInputRef.current?.focus();
      } else {
        locationInputRef.current?.focus();
      }
    }
  }, [open, isManualInput, scanStep]);

  return (
    <Modal
      open={open}
      onCancel={() => {
        stopCamera();
        resetForm();
        onClose();
      }}
      width={720}
      title={
        <div className="flex items-center gap-3">
          <ScanOutlined className="text-xl text-brand-primary" />
          <span className="text-xl font-extrabold text-brand-dark">
            Gán ô nhanh bằng mã QR
          </span>
        </div>
      }
      footer={
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            icon={isManualInput ? <CameraOutlined /> : <EditOutlined />}
            onClick={() => {
              stopCamera();
              setIsManualInput(!isManualInput);
            }}
          >
            {isManualInput ? "Chuyển sang Camera" : "Chuyển sang Nhập tay"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              stopCamera();
              resetForm();
              onClose();
            }}
            disabled={assignMutation.isPending}
          >
            Đóng
          </Button>
        </div>
      }
    >
      <div className="space-y-6 py-2">
        {/* Banner Vùng hiển thị ô được chọn / Quá trình */}
        <div className="flex items-stretch gap-3">
          <div className="flex-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Bước 1: Pallet Hàng
            </p>
            {selectedDetail ? (
              <div className="mt-2 space-y-1">
                <p className="font-mono text-lg font-black text-brand-primary">
                  {selectedDetail.product_sku || "—"}
                </p>
                <p className="line-clamp-1 text-sm text-slate-700">
                  {selectedDetail.product_name || "—"}
                </p>
                <p className="text-xs text-slate-500">
                  SL: <strong className="font-bold text-brand-dark">{toDisplayInteger(selectedDetail.expected_quantity)}</strong> · Xe: <strong className="font-bold text-brand-dark">{selectedDetail.vehicle_number || "—"}</strong>
                </p>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                <InfoCircleOutlined />
                <span>Chưa quét pallet hàng</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center text-slate-300">
            ➔
          </div>

          <div className="flex-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Bước 2: Ô chứa (Vị trí)
            </p>
            {selectedLocation ? (
              <div className="mt-2">
                <p className="font-mono text-lg font-black text-brand-primary">
                  {selectedLocation.location_code}
                </p>
                <p className="text-sm text-slate-500">
                  Vị trí ID: {selectedLocation.id}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-success-600 font-bold">
                  <CheckCircleFilled /> Sẵn sàng gán
                </p>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                <InfoCircleOutlined />
                <span>Chờ quét mã vị trí...</span>
              </div>
            )}
          </div>
        </div>

        {/* Cửa sổ Quét QR hoặc Nhập thủ công */}
        <div
          className={cn(
            "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-4 transition-all duration-300 min-h-[300px]",
            flashState === "success"
              ? "border-success-500 bg-success-50/20 shadow-lg shadow-success-200"
              : flashState === "error"
                ? "border-error-500 bg-error-50/20 shadow-lg shadow-error-200"
                : "border-slate-100 bg-slate-900",
          )}
        >
          {isManualInput ? (
            /* Layout nhập thủ công */
            <div className="w-full max-w-md space-y-4 p-6 text-white">
              <div className="text-center">
                <EditOutlined className="text-4xl text-brand-primary/80" />
                <h4 className="mt-2 text-lg font-extrabold text-slate-100">
                  Nhập mã thủ công
                </h4>
              </div>

              {scanStep === "pallet" ? (
                <div className="space-y-2">
                  <label htmlFor="pallet-input" className="text-sm font-semibold text-slate-300">
                    Nhập ID Lệnh hoặc Mã SKU của Pallet:
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="pallet-input"
                      ref={palletInputRef}
                      type="text"
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 font-mono text-base text-white placeholder-slate-500 focus:border-brand-primary focus:outline-none"
                      placeholder="Mã SKU hoặc số ID lệnh..."
                      value={manualPalletVal}
                      onChange={(e) => setManualPalletVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") processPalletScan(manualPalletVal);
                      }}
                    />
                    <Button
                      variant="primary"
                      className="!h-12 !px-5"
                      onClick={() => processPalletScan(manualPalletVal)}
                    >
                      Xác nhận
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="location-input" className="text-sm font-semibold text-slate-300">
                      Nhập Mã ô chứa (Vị trí):
                    </label>
                    <button
                      type="button"
                      onClick={() => setScanStep("pallet")}
                      className="text-xs text-brand-primary font-bold hover:underline"
                    >
                      <LeftOutlined /> Quay lại quét Pallet
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      id="location-input"
                      ref={locationInputRef}
                      type="text"
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 font-mono text-base text-white placeholder-slate-500 focus:border-brand-primary focus:outline-none"
                      placeholder="Ví dụ: CN01..."
                      value={manualLocationVal}
                      onChange={(e) => setManualLocationVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") processLocationScan(manualLocationVal);
                      }}
                    />
                    <Button
                      variant="primary"
                      className="!h-12 !px-5"
                      onClick={() => processLocationScan(manualLocationVal)}
                      loading={assignMutation.isPending}
                    >
                      Gán ô
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Layout quét Camera QR */
            <>
              {cameraErrorMsg ? (
                <div className="max-w-md p-6 text-center text-slate-100 space-y-4">
                  <CloseCircleFilled className="text-4xl text-error-500" />
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {cameraErrorMsg}
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => setIsManualInput(true)}
                    icon={<EditOutlined />}
                  >
                    Chuyển sang Nhập tay
                  </Button>
                </div>
              ) : (
                <div className="relative flex h-[350px] w-full flex-col items-center justify-center">
                  {/* Khung quét camera của html5-qrcode */}
                  <div
                    id="qr-reader-container"
                    className="absolute inset-0 h-full w-full [&_video]:object-cover [&_video]:h-full [&_video]:w-full"
                  />

                  {/* Hiệu ứng laser quét và hướng dẫn phủ lên camera */}
                  {isCameraActive && (
                    <div className="pointer-events-none relative z-10 flex h-full w-full flex-col items-center justify-between p-6">
                      <div className="rounded-full bg-slate-900/80 px-4 py-1.5 text-center text-sm font-bold text-brand-primary shadow-sm">
                        {scanStep === "pallet"
                          ? "Bước 1: Đưa mã QR của Pallet / Lệnh vào khung quét"
                          : "Bước 2: Đưa mã QR của ô chứa (VD: CN01) vào khung quét"}
                      </div>

                      {/* Hộp ngắm quét và vệt sáng laser */}
                      <div className="relative h-44 w-44 rounded-2xl border-2 border-brand-primary shadow-[0_0_0_9999px_rgba(15,23,42,0.65)]">
                        <div className="absolute left-0 right-0 top-0 h-0.5 bg-brand-primary animate-pulse" style={{
                          animation: "scan 2s linear infinite",
                          boxShadow: "0 0 8px #2563eb",
                        }} />
                      </div>

                      <div className="text-xs text-slate-400 bg-slate-900/60 px-3 py-1 rounded">
                        Giữ camera vuông góc và ổn định với mã QR
                      </div>
                    </div>
                  )}

                  {!isCameraActive && (
                    <div className="text-center text-slate-400 space-y-3">
                      <LoadingOutlined className="text-3xl text-brand-primary" />
                      <p className="text-sm">Đang kết nối camera...</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Flash feedback overlays */}
          {flashState === "success" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-success-500/10 transition-opacity">
              <CheckCircleFilled className="text-7xl text-success-500 animate-bounce" />
            </div>
          )}
          {flashState === "error" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-error-500/10 transition-opacity">
              <CloseCircleFilled className="text-7xl text-error-500 animate-bounce" />
            </div>
          )}
        </div>
      </div>
      
      {/* Styles inline hỗ trợ chuyển động tia laser quét */}
      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>
    </Modal>
  );
}
