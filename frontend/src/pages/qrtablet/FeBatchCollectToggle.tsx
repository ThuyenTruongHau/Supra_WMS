import { cn } from "@/components/ui/utils/cn";
import { tQrTabletInbound } from "@/i18n/qrTabletInbound.vi";

type FeBatchCollectToggleProps = {
  value: boolean;
  onChange: (value: boolean) => void;
  queueCount?: number;
  disabled?: boolean;
};

export default function FeBatchCollectToggle({
  value,
  onChange,
  queueCount = 0,
  disabled = false,
}: FeBatchCollectToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-brand-dark">
          {tQrTabletInbound("feBatchCollectToggle")}
        </span>
        {queueCount > 0 ? (
          <span className="inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold leading-none text-white">
            {queueCount > 99 ? "99+" : queueCount}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={tQrTabletInbound("feBatchToggleAria")}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={cn(
          "relative inline-flex h-8 w-[3.25rem] shrink-0 rounded-full p-0.5 transition-colors duration-200 ease-in-out",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
          disabled ? "cursor-not-allowed opacity-50" : "",
          value ? "bg-brand-primary" : "bg-stripe-hairline",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none block h-7 w-7 rounded-full bg-white shadow-[0_1px_3px_rgba(15,61,70,0.18)] transition-transform duration-200 ease-in-out",
            value ? "translate-x-[1.35rem]" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}
