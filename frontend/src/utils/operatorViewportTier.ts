import { useEffect, useState } from "react";
import { OPERATOR_TABLET } from "@/constants/operatorDesktopSizes";

export type OperatorViewportTier = "narrow" | "medium" | "wide" | "tv";

export function resolveOperatorViewportTier(width: number): OperatorViewportTier {
  if (width <= OPERATOR_TABLET.narrowMaxPx) return "narrow";
  if (width <= OPERATOR_TABLET.wideMaxPx) return "medium";
  if (width >= 1920) return "tv";
  return "wide";
}

export function useOperatorViewportTier(): OperatorViewportTier {
  const [tier, setTier] = useState<OperatorViewportTier>(() =>
    resolveOperatorViewportTier(
      typeof window !== "undefined" ? window.innerWidth : 1280,
    ),
  );
  useEffect(() => {
    const onResize = () =>
      setTier(resolveOperatorViewportTier(window.innerWidth));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return tier;
}

export function operatorModalWidthForTier(
  tier: OperatorViewportTier,
  viewportWidth: number,
): number {
  const padding = tier === "narrow" ? 12 : 24;
  const caps: Record<OperatorViewportTier, number> = {
    narrow: viewportWidth - padding * 2,
    medium: Math.min(Math.round(viewportWidth * 0.96), 1240),
    wide: Math.min(Math.round(viewportWidth * 0.94), 1580),
    tv: Math.min(Math.round(viewportWidth * 0.92), 1780),
  };
  return Math.max(320, caps[tier]);
}

/** Chiều cao vùng cuộn lưới card trong modal operator. */
export function operatorPickGridMaxHeightClass(
  tier: OperatorViewportTier,
): string {
  switch (tier) {
    case "narrow":
      return "max-h-[min(360px,50vh)]";
    case "medium":
      return "max-h-[min(440px,55vh)]";
    case "tv":
      return "max-h-[min(620px,62vh)]";
    default:
      return "max-h-[min(520px,58vh)]";
  }
}

/** Lưới nút chọn SKU — cột responsive tablet / desktop / TV. */
export function operatorPickSkuGridClass(tier: OperatorViewportTier): string {
  switch (tier) {
    case "narrow":
      return "grid grid-cols-2 gap-2.5 sm:grid-cols-3";
    case "medium":
      return "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4";
    case "tv":
      return "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
    default:
      return "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
  }
}

export function operatorPickSkuTileClass(tier: OperatorViewportTier): string {
  switch (tier) {
    case "narrow":
      return "min-h-[4.25rem] rounded-xl border px-3 py-2.5";
    case "medium":
      return "min-h-[4.75rem] rounded-xl border px-4 py-3";
    case "tv":
      return "min-h-[6.5rem] rounded-2xl border-2 px-5 py-4";
    default:
      return "min-h-[5.25rem] rounded-xl border px-4 py-3.5";
  }
}

export function operatorPickSkuTextClass(tier: OperatorViewportTier): string {
  switch (tier) {
    case "narrow":
      return "text-base font-bold";
    case "medium":
      return "text-lg font-bold";
    case "tv":
      return "text-2xl font-black tracking-tight";
    default:
      return "text-xl font-bold";
  }
}

export function operatorPickSkuQtyClass(tier: OperatorViewportTier): string {
  switch (tier) {
    case "narrow":
      return "text-xs font-semibold";
    case "medium":
      return "text-sm font-semibold";
    case "tv":
      return "text-lg font-semibold";
    default:
      return "text-base font-semibold";
  }
}

export function operatorPickBodyTextClass(tier: OperatorViewportTier): string {
  switch (tier) {
    case "narrow":
      return "text-sm";
    case "medium":
      return "text-base";
    case "tv":
      return "text-xl";
    default:
      return "text-lg";
  }
}

export function operatorPickModalTitleClass(tier: OperatorViewportTier): string {
  switch (tier) {
    case "narrow":
      return "text-lg";
    case "medium":
      return "text-xl";
    case "tv":
      return "text-3xl";
    default:
      return "text-2xl";
  }
}

/** Lưới card đơn nhập operator (danh sách đơn / xe). */
export function operatorInboundOrderGridClass(tier: OperatorViewportTier): string {
  switch (tier) {
    case "narrow":
      return "grid auto-rows-min grid-cols-1 gap-2 p-2";
    case "medium":
      return "grid auto-rows-min grid-cols-1 gap-2 p-2 sm:grid-cols-2";
    case "tv":
      return "grid auto-rows-min grid-cols-2 gap-3 p-3 lg:grid-cols-3 xl:grid-cols-4";
    default:
      return "grid auto-rows-min grid-cols-1 gap-2.5 p-2.5 sm:grid-cols-2 lg:grid-cols-3";
  }
}

export function operatorInboundOrderCardShellClass(
  tier: OperatorViewportTier,
): string {
  switch (tier) {
    case "narrow":
      return "min-h-[4.5rem] rounded-lg border p-2 pl-2.5";
    case "medium":
      return "min-h-[5rem] rounded-lg border p-2 pl-2.5";
    case "tv":
      return "min-h-[6rem] rounded-xl border p-3 pl-3.5";
    default:
      return "min-h-[5.5rem] rounded-lg border p-2.5 pl-3";
  }
}

export function operatorInboundOrderCodeClass(tier: OperatorViewportTier): string {
  switch (tier) {
    case "narrow":
      return "truncate font-mono text-[13px] font-bold leading-tight text-brand-dark";
    case "medium":
      return "truncate font-mono text-sm font-bold leading-tight text-brand-dark";
    case "tv":
      return "truncate font-mono text-lg font-extrabold leading-tight text-brand-dark";
    default:
      return "truncate font-mono text-[15px] font-bold leading-tight text-brand-dark";
  }
}

export function operatorInboundOrderMetaClass(tier: OperatorViewportTier): string {
  switch (tier) {
    case "narrow":
      return "text-[11px] text-stripe-ink-mute";
    case "medium":
      return "text-xs text-stripe-ink-mute";
    case "tv":
      return "text-sm text-stripe-ink-mute";
    default:
      return "text-xs text-stripe-ink-mute";
  }
}

/**
 * Sidebar giám sát: gấp đôi cỡ chữ hiện tại.
 * Tablet dùng stage 1920 rồi scale nên cùng cỡ desktop; TV không scale nên lớn hơn.
 */
export function monitorSidebarType(tier: OperatorViewportTier) {
  const tv = tier === "tv";
  return {
    shellHeader: tv ? "px-6 py-5" : "px-5 py-4",
    zoneTitle: tv
      ? "text-[2.5rem] font-bold leading-tight text-brand-dark"
      : "text-[2rem] font-bold leading-tight text-brand-dark",
    hint: tv
      ? "mt-2 text-[2rem] leading-snug text-slate-500"
      : "mt-1.5 text-2xl leading-snug text-slate-500",
    empty: tv
      ? "px-2 py-8 text-center text-[2.5rem] text-slate-500"
      : "px-2 py-6 text-center text-[1.75rem] text-slate-500",
    list: tv ? "px-5 py-5" : "px-4 py-4",
    sectionGap: tv ? "space-y-6" : "space-y-5",
    blockHeader: tv ? "px-5 py-5" : "px-4 py-4",
    blockHeaderRow: tv
      ? "flex flex-nowrap items-baseline justify-between gap-5"
      : "flex flex-nowrap items-baseline justify-between gap-4",
    vtName: tv
      ? "min-w-0 shrink truncate text-[3.75rem] font-extrabold leading-tight text-brand-dark"
      : "min-w-0 shrink truncate text-[2.5rem] font-extrabold leading-tight text-brand-dark",
    sku: tv
      ? "shrink-0 whitespace-nowrap text-right font-mono text-[3.75rem] font-extrabold leading-tight text-brand-dark"
      : "shrink-0 whitespace-nowrap text-right font-mono text-[2.5rem] font-extrabold leading-tight text-brand-dark",
    tableWrap: tv ? "px-5 pb-4" : "px-4 pb-3",
    tableHeader: tv
      ? "grid grid-cols-[1fr_auto_1fr] gap-4 border-b border-stripe-hairline px-4 py-3 text-[2.25rem] font-bold uppercase tracking-wide text-slate-500"
      : "grid grid-cols-[1fr_auto_1fr] gap-3 border-b border-stripe-hairline px-3 py-2 text-xl font-bold uppercase tracking-wide text-slate-500",
    tableHeaderQty: "text-right",
    tableHeaderLocator: "text-right",
    rows: tv ? "space-y-2 pt-2" : "space-y-1.5 pt-1.5",
    row: tv
      ? "grid grid-cols-[1fr_auto_1fr] items-baseline gap-4 rounded-xl border border-transparent bg-white px-4 py-4 text-[3rem]"
      : "grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 rounded-xl border border-transparent bg-white px-3 py-3 text-[2rem]",
    rowCc: tv
      ? "min-w-0 break-words font-semibold leading-snug text-slate-800"
      : "min-w-0 break-words font-semibold leading-snug text-slate-800",
    rowQty: tv
      ? "shrink-0 text-right font-bold tabular-nums text-brand-primary"
      : "shrink-0 text-right font-bold tabular-nums text-brand-primary",
    rowLocator: tv
      ? "min-w-0 break-words text-right font-semibold leading-snug text-slate-700"
      : "min-w-0 break-words text-right font-semibold leading-snug text-slate-700",
  };
}

export function operatorPickFooterButtonClass(tier: OperatorViewportTier): string {
  switch (tier) {
    case "narrow":
      return "!h-10 !min-w-[112px] !text-sm";
    case "medium":
      return "!h-11 !min-w-[128px] !text-base";
    case "tv":
      return "!h-14 !min-w-[180px] !text-xl !px-6";
    default:
      return "!h-12 !min-w-[148px] !text-lg";
  }
}
