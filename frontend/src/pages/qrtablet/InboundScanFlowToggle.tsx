import { cn } from "@/components/ui/utils/cn";
import { tQrTabletInbound } from "@/i18n/qrTabletInbound.vi";
import type { InboundScanFlow } from "@/pages/qrtablet/inboundScanFlow";

type InboundScanFlowToggleProps = {
  value: InboundScanFlow;
  onChange: (value: InboundScanFlow) => void;
};

export default function InboundScanFlowToggle({
  value,
  onChange,
}: InboundScanFlowToggleProps) {
  const isPackerMode = value === "continuous";

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-semibold text-brand-dark">
        {tQrTabletInbound("flowPackerModeLabel")}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isPackerMode}
        aria-label={tQrTabletInbound("flowToggleAria")}
        onClick={() => onChange(isPackerMode ? "assign" : "continuous")}
        className={cn(
          "relative inline-flex h-8 w-[3.25rem] shrink-0 rounded-full p-0.5 transition-colors duration-200 ease-in-out",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
          isPackerMode ? "bg-brand-primary" : "bg-stripe-hairline",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none block h-7 w-7 rounded-full bg-white shadow-[0_1px_3px_rgba(15,61,70,0.18)] transition-transform duration-200 ease-in-out",
            isPackerMode ? "translate-x-[1.35rem]" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}
