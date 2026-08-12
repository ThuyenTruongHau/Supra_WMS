import { cn } from "@/components/ui";

const STATUS_LABELS: Record<string, string> = {
  initialize: "Khởi tạo",
  reserved: "Giữ chỗ",
  reversed: "Giữ chỗ",
  in_transit: "Đang luân chuyển",
  "in-progress": "Đang xử lý",
  completed: "Hoàn thành",
};

const STATUS_STYLES: Record<string, string> = {
  initialize:
    "bg-slate-100 text-slate-700 border-slate-200 shadow-sm shadow-slate-200/60",
  reserved:
    "bg-cyan-100 text-cyan-800 border-cyan-200 shadow-sm shadow-cyan-200/60",
  reversed:
    "bg-cyan-100 text-cyan-800 border-cyan-200 shadow-sm shadow-cyan-200/60",
  in_transit:
    "bg-orange-100 text-orange-800 border-orange-200 shadow-sm shadow-orange-200/60",
  "in-progress":
    "bg-amber-100 text-amber-800 border-amber-200 shadow-sm shadow-amber-200/60",
  completed:
    "bg-emerald-100 text-emerald-800 border-emerald-200 shadow-sm shadow-emerald-200/60",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

interface InboundStatusTagProps {
  status: string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

const SIZE_STYLES: Record<"sm" | "md", string> = {
  sm: "rounded-md border px-2 py-0.5 text-xs font-semibold tracking-normal",
  md: "rounded-lg border px-3.5 py-1.5 text-base font-extrabold tracking-wide",
};

export default function InboundStatusTag({
  status,
  label,
  className,
  size = "md",
}: InboundStatusTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap",
        SIZE_STYLES[size],
        STATUS_STYLES[status] ??
          "bg-slate-100 text-slate-600 border-slate-200 shadow-sm",
        className,
      )}
    >
      {label ?? statusLabel(status)}
    </span>
  );
}
