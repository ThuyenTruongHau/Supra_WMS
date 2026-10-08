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
