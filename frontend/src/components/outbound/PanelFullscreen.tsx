/**
 * Phóng to panel — Fullscreen API (ra ngoài chrome trình duyệt).
 * Fallback: overlay fixed nếu browser từ chối fullscreen.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CompressOutlined, ExpandOutlined } from "@ant-design/icons";
import { Button, cn } from "@/components/ui";
import { operatorDesktopClass } from "@/constants/operatorDesktopSizes";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function getFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function requestElementFullscreen(el: HTMLElement): Promise<boolean> {
  const node = el as FullscreenElement;
  try {
    if (typeof node.requestFullscreen === "function") {
      await node.requestFullscreen();
      return true;
    }
    if (typeof node.webkitRequestFullscreen === "function") {
      await node.webkitRequestFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function exitDocumentFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument;
  if (!getFullscreenElement()) return;
  try {
    if (typeof document.exitFullscreen === "function") {
      await document.exitFullscreen();
      return;
    }
    if (typeof doc.webkitExitFullscreen === "function") {
      await doc.webkitExitFullscreen();
    }
  } catch {
    /* ignore */
  }
}

export function PanelExpandButton({
  onClick,
  title = "Phóng to",
  className,
}: {
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="small"
      icon={<ExpandOutlined />}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      title={title}
      className={cn(
        `${operatorDesktopClass.buttonHeightXs} !pointer-events-auto !px-2.5 !shadow-md`,
        className,
      )}
    >
      <span className="hidden sm:inline">Phóng to</span>
    </Button>
  );
}

export function PanelFullscreenShell({
  open,
  title,
  onClose,
  children,
  className,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const enteredFsRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return;

    const root = rootRef.current;
    let cancelled = false;
    enteredFsRef.current = false;

    if (root) {
      void requestElementFullscreen(root).then((ok) => {
        if (!cancelled && ok) enteredFsRef.current = true;
      });
    }

    const onFsChange = () => {
      if (cancelled || closingRef.current) return;
      // Chỉ đóng shell khi đã vào native fullscreen rồi bị thoát (Esc / browser).
      if (!getFullscreenElement() && enteredFsRef.current) {
        enteredFsRef.current = false;
        onCloseRef.current();
      }
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelled = true;
      enteredFsRef.current = false;
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      if (getFullscreenElement()) {
        void exitDocumentFullscreen();
      }
    };
  }, [open]);

  // Giữ Esc khi fallback overlay (không vào được native fullscreen)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (getFullscreenElement()) return; // native Esc đã xử lý
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleClose = () => {
    closingRef.current = true;
    void (async () => {
      await exitDocumentFullscreen();
      closingRef.current = false;
      onCloseRef.current();
    })();
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className={cn(
        "fixed inset-0 z-[1100] flex h-screen w-screen flex-col bg-slate-100",
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <Button
        type="button"
        variant="secondary"
        icon={<CompressOutlined />}
        onClick={handleClose}
        title="Thoát (Esc)"
        className={`!absolute !right-3 !top-3 z-[1110] ${operatorDesktopClass.buttonHeightSm} !shadow-md`}
      >
        Thoát
      </Button>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>,
    document.body,
  );
}
