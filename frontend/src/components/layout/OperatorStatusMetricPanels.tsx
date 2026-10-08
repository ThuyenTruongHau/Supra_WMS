import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export type AgvStatusRow = {
  id: string;
  status: string;
  tone?:
    | "active"
    | "standby"
    | "waiting"
    | "idle"
    | "charging"
    | "task"
    | "offline"
    | "unknown";
};

export type BufferSlotLegend = {
  occupied_count: number;
  empty_count: number;
  total?: number;
};

export type GoodsStatusLegend = {
  staging_count: number;
  intransit_count: number;
  stock_count: number;
};

type PanelShellProps = {
  title: string;
  children: ReactNode;
  compact?: boolean;
};

function PanelShell({ title, children, compact }: PanelShellProps) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "truncate font-bold uppercase tracking-wider text-stripe-ink-mute",
          compact ? "text-sm" : "text-base",
        )}
      >
        {title}
      </p>
      <div className={cn("space-y-1", compact ? "mt-1" : "mt-1.5")}>
        {children}
      </div>
    </div>
  );
}

const AGV_TONE_DOT: Record<NonNullable<AgvStatusRow["tone"]>, string> = {
  active: "bg-success-500",
  waiting: "bg-success-500",
  standby: "bg-warning-500",
  idle: "bg-success-500",
  charging: "bg-warning-500",
  task: "bg-info-500",
  offline: "bg-slate-400",
  unknown: "bg-slate-400",
};

const AGV_TONE_TEXT: Record<NonNullable<AgvStatusRow["tone"]>, string> = {
  active: "text-teal-700",
  waiting: "text-teal-700",
  standby: "text-warning-600",
  idle: "text-success-600",
  charging: "text-warning-600",
  task: "text-info-700",
  offline: "text-slate-500",
  unknown: "text-slate-500",
};

export function RobotStatusPanel({
  rows,
  compact,
  inline = false,
}: {
  rows: AgvStatusRow[];
  compact?: boolean;
  inline?: boolean;
}) {
  return (
    <PanelShell title="Trạng thái robot" compact={compact}>
      <div
        className={
          inline ? "flex flex-wrap items-center gap-x-6 gap-y-1" : "space-y-1"
        }
      >
        {rows.map((row) => {
          const tone = row.tone ?? "active";
          return (
            <div
              key={row.id}
              className={cn(
                "flex min-w-0 max-w-full items-center gap-2",
                !inline && "justify-between",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", AGV_TONE_DOT[tone])}
                  aria-hidden
                />
                <span
                  className={cn(
                    "truncate font-bold text-brand-dark",
                    compact ? "text-base" : "text-lg",
                  )}
                >
                  {row.id}
                </span>
              </span>
              <span
                className={cn(
                  "min-w-0 truncate font-bold",
                  compact ? "text-base" : "text-lg",
                  AGV_TONE_TEXT[tone],
                )}
                title={row.status}
              >
                {row.status}
              </span>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

export function BufferSlotLegendPanel({
  slots,
  compact,
}: {
  slots: BufferSlotLegend;
  compact?: boolean;
}) {
  const rows = [
    {
      key: "occupied",
      label: "Đã có hàng",
      count: slots.occupied_count,
      boxClass: "border-success-400/70 bg-success-50/80",
      countClass: "text-success-600",
    },
    {
      key: "empty",
      label: "Chưa có hàng",
      count: slots.empty_count,
      boxClass: "border-slate-300 bg-slate-50",
      countClass: "text-slate-500",
    },
  ] as const;

  return (
    <PanelShell title="Chú giải trạng thái ô" compact={compact}>
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex min-w-0 items-center justify-between gap-2"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "h-3.5 w-5 shrink-0 rounded border",
                row.boxClass,
              )}
              aria-hidden
            />
            <span
              className={cn(
                "truncate font-bold text-brand-dark",
                compact ? "text-base" : "text-lg",
              )}
            >
              {row.label}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 font-bold tabular-nums",
              compact ? "text-base" : "text-lg",
              row.countClass,
            )}
          >
            {row.count} ô
          </span>
        </div>
      ))}
    </PanelShell>
  );
}

export function GoodsStatusLegendPanel({
  goods,
  compact,
}: {
  goods: GoodsStatusLegend;
  compact?: boolean;
}) {
  const rows = [
    {
      key: "staging",
      label: "Chờ nhập (Staging)",
      count: goods.staging_count,
      countClass: "text-warning-600",
    },
    {
      key: "intransit",
      label: "Đang đi (Intransit)",
      count: goods.intransit_count,
      countClass: "text-info-700",
    },
    {
      key: "stock",
      label: "Đã nhập (Stock)",
      count: goods.stock_count,
      countClass: "text-success-600",
    },
  ] as const;

  return (
    <PanelShell title="Trạng thái hàng hoá" compact={compact}>
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex min-w-0 items-center justify-between gap-2"
        >
          <span
            className={cn(
              "min-w-0 truncate font-bold text-brand-dark",
              compact ? "text-base" : "text-lg",
            )}
          >
            {row.label}
          </span>
          <span
            className={cn(
              "shrink-0 font-bold tabular-nums",
              compact ? "text-base" : "text-lg",
              row.countClass,
            )}
          >
            {row.count}
          </span>
        </div>
      ))}
    </PanelShell>
  );
}
