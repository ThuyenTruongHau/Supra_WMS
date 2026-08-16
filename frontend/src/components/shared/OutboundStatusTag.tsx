import { cn } from "@/components/ui";

const STATUS_STYLES: Record<string, string> = {
  initialize:
    "bg-slate-100 text-slate-700 border-slate-200 shadow-sm shadow-slate-200/60",
  reserved:
    "bg-cyan-100 text-cyan-800 border-cyan-200 shadow-sm shadow-cyan-200/60",
  in_progress:
    "bg-orange-100 text-orange-800 border-orange-200 shadow-sm shadow-orange-200/60",
  completed:
    "bg-emerald-100 text-emerald-800 border-emerald-200 shadow-sm shadow-emerald-200/60",
};

interface OutboundStatusTagProps {
  status: string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

const SIZE_STYLES: Record<"sm" | "md", string> = {
  sm: "rounded-md border px-2.5 py-1 text-sm font-semibold tracking-normal",
  md: "rounded-lg border px-4 py-1.5 text-base font-extrabold tracking-wide",
};

export default function OutboundStatusTag({
  status,
  label,
  className,
  size = "md",
}: OutboundStatusTagProps) {
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
      {label ?? status}
    </span>
  );
}
