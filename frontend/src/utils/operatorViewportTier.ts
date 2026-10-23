import { useEffect, useState } from "react";
import { operatorStageEl } from "@/components/layout/operatorStage";
import {
  OPERATOR_INBOUND_MAP_TUNING,
  OPERATOR_INBOUND_MAP_TUNING_TABLET,
  OPERATOR_STAGE,
  OPERATOR_TABLET,
  OPERATOR_WAVE_MAP_TUNING,
  OPERATOR_WAVE_MAP_TUNING_TABLET,
} from "@/constants/operatorDesktopSizes";

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
      return "min-h-20 rounded-xl border px-3 py-3";
    case "medium":
      return "min-h-20 rounded-xl border px-4 py-3";
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
  if (isOperatorTabletViewport(tier)) {
    return operatorZoneActionButtonClass(tier) + " !min-w-[140px]";
  }
  switch (tier) {
    case "tv":
      return "!h-14 !min-w-[180px] !text-xl !px-6";
    default:
      return "!h-12 !min-w-[148px] !text-lg";
  }
}

/** Footer modal operator — cùng cỡ nút map (Gọi lệnh, …). */
export function operatorModalActionButtonClass(
  tier: OperatorViewportTier,
): string {
  return operatorZoneActionButtonClass(tier);
}

/** Tablet 8" / stage scale — không áp dụng laptop (wide) hay TV. */
export function isOperatorTabletViewport(tier: OperatorViewportTier): boolean {
  return tier === "narrow" || tier === "medium";
}

export function operatorInboundMapTuningForTier(tier: OperatorViewportTier) {
  return isOperatorTabletViewport(tier)
    ? OPERATOR_INBOUND_MAP_TUNING_TABLET
    : OPERATOR_INBOUND_MAP_TUNING;
}

export function operatorWaveMapTuningForTier(tier: OperatorViewportTier) {
  return isOperatorTabletViewport(tier)
    ? OPERATOR_WAVE_MAP_TUNING_TABLET
    : OPERATOR_WAVE_MAP_TUNING;
}

/** Nút toolbar trang đơn nhập (map header, footer rightbar). */
export function operatorInboundToolbarButtonClass(
  tier: OperatorViewportTier,
): string {
  return isOperatorTabletViewport(tier)
    ? "!h-12 !px-5 !text-base"
    : "!h-10 !px-4 !text-base";
}

export function operatorInboundFooterButtonClass(
  tier: OperatorViewportTier,
): string {
  return isOperatorTabletViewport(tier)
    ? "!h-14 !w-full justify-center !text-lg"
    : "!h-10 !w-full justify-center !text-sm";
}

/** Filter SKU + lọc ngày — panel rightbar (tablet). */
export function operatorInboundRightbarFilterClass(
  tier: OperatorViewportTier,
): string {
  if (!isOperatorTabletViewport(tier)) return "";
  return operatorRightbarFilterTouchClass;
}

/** Rightbar xuất kho — cùng kích thước chạm với nhập kho. */
export function operatorOutboundRightbarFilterClass(
  tier: OperatorViewportTier,
): string {
  return operatorInboundRightbarFilterClass(tier);
}

const operatorRightbarFilterTouchClass = [
  "[&_.ant-picker]:!h-14",
  "[&_.ant-picker-input>input]:!text-lg",
  "[&_.ant-input-affix-wrapper]:!min-h-14",
  "[&_.ant-input-affix-wrapper]:!items-center",
  "[&_.ant-input-affix-wrapper]:!py-2",
  "[&_.ant-input]:!text-lg",
  "[&_button]:!h-14",
  "[&_button]:!min-w-[96px]",
  "[&_button]:!text-lg",
].join(" ");

/** Nút thao tác map (Gọi lệnh, Xem kho, …) — xuất + monitor, tablet. */
export function operatorZoneActionButtonClass(
  tier: OperatorViewportTier,
): string {
  return isOperatorTabletViewport(tier)
    ? "!h-20 !min-h-20 !px-8 !text-xl !font-bold"
    : "!h-10 !px-4 !text-base";
}

/** @deprecated Dùng `operatorZoneActionButtonClass`. */
export function operatorOutboundOverviewActionButtonClass(
  tier: OperatorViewportTier,
): string {
  return operatorZoneActionButtonClass(tier);
}

/** Hàng chọn khu / Gọi lệnh trên overview (chỉ cao vùng bấm, giữ chữ). */
export function operatorZoneOverviewPickRowClass(
  tier: OperatorViewportTier,
): string {
  return isOperatorTabletViewport(tier) ? "min-h-20" : "";
}

/** @deprecated Dùng `operatorZoneOverviewPickRowClass`. */
export function operatorOutboundOverviewCallCommandRowClass(
  tier: OperatorViewportTier,
): string {
  return operatorZoneOverviewPickRowClass(tier);
}

/** Toolbar map — back vuông (monitor / xuất chi tiết). */
export function operatorZoneToolbarBackButtonClass(
  tier: OperatorViewportTier,
): string {
  return isOperatorTabletViewport(tier)
    ? "!flex !h-20 !w-20 !min-h-20 !min-w-20 !items-center !justify-center !rounded-lg !p-0 [&_.ant-btn-icon]:!m-0 !text-2xl"
    : "!flex !h-11 !w-11 !items-center !justify-center !rounded-lg !p-0 [&_.ant-btn-icon]:!m-0";
}

/** Thanh toolbar map — cao theo nút thao tác tablet. */
export function operatorZoneToolbarShellClass(
  tier: OperatorViewportTier,
): string {
  return isOperatorTabletViewport(tier)
    ? "min-h-20 items-center gap-2 py-1"
    : "!h-11 items-center gap-2";
}

/** Modal chọn VT (Gọi lệnh xuất / monitor). */
export function operatorVtLocationPickButtonClass(
  tier: OperatorViewportTier,
): string {
  return isOperatorTabletViewport(tier)
    ? "min-h-20 py-5"
    : "min-h-[88px] py-4";
}

/** Modal mount trong `.operator-stage` (tablet) — toạ độ layout 1920px, không dùng viewport vật lý. */
export function operatorModalMountedInStage(): boolean {
  return (
    typeof document !== "undefined" &&
    operatorStageEl.current != null &&
    operatorStageEl.current.isConnected
  );
}

/** Modal Gọi lệnh (chọn VT / SKU). */
export function operatorCallCommandModalWidthForTier(
  tier: OperatorViewportTier,
  viewportWidth: number,
): number {
  if (operatorModalMountedInStage()) {
    const stageW =
      operatorStageEl.current?.clientWidth ?? OPERATOR_STAGE.width;
    return Math.max(960, Math.round(stageW - 48));
  }
  if (tier === "tv") {
    return Math.min(Math.round(viewportWidth * 0.88), 1600);
  }
  if (tier === "wide") {
    return Math.min(Math.round(viewportWidth * 0.68), 1040);
  }
  return Math.min(Math.round(viewportWidth * 0.9), 960);
}

/** Modal chọn mã hàng — chiều cao body (theo stage hoặc viewport). */
export function operatorSortingItemsModalBodyMaxHeight(
  tier: OperatorViewportTier,
): string {
  if (operatorModalMountedInStage()) {
    const stageH =
      operatorStageEl.current?.clientHeight ?? OPERATOR_STAGE.height;
    return `${Math.max(440, Math.round(stageH - 300))}px`;
  }
  if (isOperatorTabletViewport(tier)) {
    return "calc(100dvh - 13rem)";
  }
  switch (tier) {
    case "tv":
      return "calc(100vh - 12.5rem)";
    default:
      return "calc(100vh - 11rem)";
  }
}

export function operatorInboundSideTabBarClass(
  tier: OperatorViewportTier,
): string {
  return isOperatorTabletViewport(tier) ? "h-14" : "h-12";
}

export function operatorInboundSideTabButtonClass(
  tier: OperatorViewportTier,
): string {
  return isOperatorTabletViewport(tier)
    ? "h-14 px-3 text-lg leading-none"
    : "h-12 px-3 text-2xl leading-none";
}

/** Menu dropdown chọn robot nhập (FL 01 / FL 02). */
export function operatorRobotPickerMenuClass(tier: OperatorViewportTier): string {
  return isOperatorTabletViewport(tier)
    ? "operator-robot-picker-menu operator-robot-picker-menu--tablet"
    : "operator-robot-picker-menu";
}

export function operatorRobotPickerItemLabelClass(
  tier: OperatorViewportTier,
): string {
  return isOperatorTabletViewport(tier)
    ? "text-2xl font-bold tracking-wide"
    : "text-lg font-semibold";
}

export function operatorRobotPickerItemIconClass(
  tier: OperatorViewportTier,
): string {
  return isOperatorTabletViewport(tier) ? "text-2xl" : "text-lg";
}

export type OperatorAssigneeSelectToolbar = "zone" | "inbound";

/** Class modifier — chiều cao trong operatorTabletScale.css (Ant Design 6: `.ant-select` root). */
export function operatorAssigneeSelectTriggerModifier(
  tier: OperatorViewportTier,
  toolbar: OperatorAssigneeSelectToolbar = "zone",
): string {
  const tablet = isOperatorTabletViewport(tier);
  if (tablet) {
    return toolbar === "zone"
      ? "operator-assignee-select-trigger--zone-tablet"
      : "operator-assignee-select-trigger--inbound-tablet";
  }
  return toolbar === "zone"
    ? "operator-assignee-select-trigger--zone"
    : "operator-assignee-select-trigger--inbound";
}

/** Ô chọn người nhập / người xuất — cao khớp nút toolbar cạnh bên. */
export function operatorAssigneeSelectTriggerClass(
  tier: OperatorViewportTier,
  toolbar: OperatorAssigneeSelectToolbar = "zone",
): string {
  const tablet = isOperatorTabletViewport(tier);
  return [
    "operator-assignee-select-trigger",
    operatorAssigneeSelectTriggerModifier(tier, toolbar),
    tablet ? "!min-w-[240px] !max-w-[400px]" : "!min-w-[200px] !max-w-[320px]",
  ].join(" ");
}

/** Pixel height khớp `operatorZoneActionButtonClass` / `operatorInboundToolbarButtonClass`. */
export function operatorAssigneeSelectTriggerHeightPx(
  tier: OperatorViewportTier,
  toolbar: OperatorAssigneeSelectToolbar = "zone",
): number {
  const tablet = isOperatorTabletViewport(tier);
  if (tablet) return toolbar === "zone" ? 80 : 48;
  return 40;
}

/** Dropdown danh sách nhân viên — style trong operatorTabletScale.css */
export function operatorAssigneeSelectPopupClass(
  tier: OperatorViewportTier,
): string {
  return isOperatorTabletViewport(tier)
    ? "operator-assignee-select-popup operator-assignee-select-popup--tablet"
    : "operator-assignee-select-popup";
}

export function operatorAssigneeSelectListHeight(
  tier: OperatorViewportTier,
): number {
  return isOperatorTabletViewport(tier) ? 520 : 360;
}
