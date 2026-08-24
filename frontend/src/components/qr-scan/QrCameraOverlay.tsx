import { useEffect, useRef } from "react";
import { message } from "antd";
import { Button } from "@/components/ui";
import { decodeQrFromVideo } from "./decode";

export function QrCameraOverlay({
  title,
  onScan,
  onClose,
}: {
  title: string;
  onScan: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let stream: MediaStream | null = null;
    let rafId = 0;
    let stopped = false;
    let handled = false;

    const tick = () => {
      if (stopped || handled) return;
      if (video.readyState >= 2) {
        const value = decodeQrFromVideo(video);
        if (value) {
          handled = true;
          onScanRef.current(value);
          return;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((media) => {
        if (stopped) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = media;
        video.srcObject = media;
        return video.play();
      })
      .then(() => {
        rafId = requestAnimationFrame(tick);
      })
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : "Không mở được camera");
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-brand-dark/95">
      <div className="flex items-center justify-between px-5 py-4 text-white">
        <h2 className="text-xl font-bold">{title}</h2>
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <video
          ref={videoRef}
          className="w-full max-w-lg overflow-hidden rounded-xl bg-black"
          playsInline
          muted
          autoPlay
        />
      </div>
      <p className="pb-8 text-center text-base text-white/80">Đưa mã QR vào khung hình</p>
    </div>
  );
}
