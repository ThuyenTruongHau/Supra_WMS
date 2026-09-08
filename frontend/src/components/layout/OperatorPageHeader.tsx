import { useEffect, useState, type ReactNode } from "react";
import { DownOutlined, UpOutlined } from "@ant-design/icons";
import { cn } from "@/components/ui";
import { useOperatorShell } from "./OperatorShellContext";

export type OperatorMetricItem = {
  key: string;
  label: string;
  value?: ReactNode;
  /** Giá trị phụ ngắn (1 dòng), không dùng làm hint dài */
  sub?: ReactNode;
  valueClassName?: string;
  /** Panel tùy biến thay cho layout label/value mặc định */
  panel?: ReactNode;
};

type OperatorPageHeaderProps = {
  title: string;
  warehouseName?: string;
  clockLabel?: string;
  metrics?: OperatorMetricItem[] | null;
  metricsLoading?: boolean;
  metricsEmpty?: ReactNode;
  /** Tăng cỡ chữ và khoảng thở cho dải KPI trên các màn hình vận hành chính. */
  largeMetrics?: boolean;
  className?: string;
  /** Cho phép thu toàn bộ header + metric thành một nút hiện lại. */
  collapsible?: boolean;
  /** Thu đồng thời header trên cùng của UserLayout. */
  collapseShellHeader?: boolean;
  defaultCollapsed?: boolean;
  /** Ép trạng thái thu gọn từ component cha (vd. auto thu khi vào lớp chi tiết). */
  collapsed?: boolean;
  /** Khóa thu gọn — không hiện nút mở lại header. */
  collapseLocked?: boolean;
};

/**
 * Header sáng + dải metric cho trang operator.
 * Thay console tối (bg-brand-dark / chữ trắng).
 */
export default function OperatorPageHeader({
  title,
  warehouseName,
  clockLabel,
  metrics,
  metricsLoading = false,
  metricsEmpty,
  largeMetrics = false,
  className,
  collapsible = false,
  collapseShellHeader = false,
  defaultCollapsed = false,
  collapsed: controlledCollapsed,
  collapseLocked = false,
}: OperatorPageHeaderProps) {
  const { setShellHeaderCollapsed } = useOperatorShell();
  const [collapsed, setCollapsed] = useState(
    collapsible && (controlledCollapsed ?? defaultCollapsed),
  );
  const isCollapsed = controlledCollapsed ?? collapsed;
  const showMetrics =
    metricsLoading ||
    metricsEmpty != null ||
    (metrics != null && metrics.length > 0);

  useEffect(
    () => () => {
      if (collapseShellHeader) setShellHeaderCollapsed(false);
    },
    [collapseShellHeader, setShellHeaderCollapsed],
  );

  useEffect(() => {
    if (controlledCollapsed !== undefined) return;
    if (collapsible && defaultCollapsed && collapseShellHeader) {
      setShellHeaderCollapsed(true);
    }
  }, [
    collapsible,
    defaultCollapsed,
    collapseShellHeader,
    controlledCollapsed,
    setShellHeaderCollapsed,
  ]);

  useEffect(() => {
    if (controlledCollapsed === undefined) return;
    if (collapseShellHeader) setShellHeaderCollapsed(controlledCollapsed);
  }, [controlledCollapsed, collapseShellHeader, setShellHeaderCollapsed]);

  const changeCollapsed = (next: boolean) => {
    if (controlledCollapsed !== undefined) return;
    setCollapsed(next);
    if (collapseShellHeader) setShellHeaderCollapsed(next);
  };

  if (collapsible && isCollapsed && collapseLocked) {
    return null;
  }

  if (collapsible && isCollapsed) {
    return (
      <button
        type="button"
        onClick={() => changeCollapsed(false)}
        className={cn(
          "flex h-6 w-16 shrink-0 self-center items-center justify-center rounded-b-full border border-t-0 border-stripe-hairline bg-panel text-stripe-ink-mute shadow-sm transition-colors hover:border-brand-primary/40 hover:bg-panel-soft hover:text-brand-primary",
          className,
        )}
        title="Hiện thông tin chung"
        aria-label="Hiện thông tin chung"
        aria-expanded={false}
      >
        <DownOutlined className="text-sm" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-xl border border-stripe-hairline bg-panel shadow-stripe-1",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 px-4",
          largeMetrics ? "py-2" : "py-3",
        )}
      >
        <div className="min-w-0">
          <h2 className="text-3xl font-black tracking-tight text-brand-dark sm:text-4xl">
            {title}
          </h2>
          {warehouseName ? (
            <p className="mt-1 truncate text-base font-medium text-stripe-ink-mute">
              {warehouseName}
            </p>
          ) : null}
        </div>
        {clockLabel ? (
          <time className="shrink-0 font-mono text-lg font-bold tabular-nums text-brand-dark">
            {clockLabel}
          </time>
        ) : null}
      </div>

      {showMetrics ? (
        <div
          className={cn(
            "border-t border-stripe-hairline px-2 sm:px-3 bg-brand-primary/5",
            largeMetrics ? "py-1.5" : "py-2",
          )}
        >
          {metricsLoading ? (
            <div className="grid animate-pulse grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-2 py-1">
                  <div className="h-3 w-16 rounded bg-panel-soft" />
                  <div className="mt-2 h-5 w-24 rounded bg-panel-soft" />
                </div>
              ))}
            </div>
          ) : metricsEmpty ? (
            <p className="px-2 py-1 text-sm text-stripe-ink-mute">
              {metricsEmpty}
            </p>
          ) : metrics && metrics.length > 0 ? (
            <div
              className={cn(
                "grid grid-cols-2 gap-1 sm:grid-cols-3 sm:divide-x sm:divide-stripe-hairline",
                metrics.length >= 5
                  ? "xl:grid-cols-5"
                  : metrics.length === 4
                    ? "xl:grid-cols-4"
                    : metrics.length === 3
                      ? "xl:grid-cols-3"
                      : "xl:grid-cols-2",
              )}
            >
              {metrics.map((m) => (
                <div
                  key={m.key}
                  className="min-w-0 px-3 py-1.5"
                >
                  {m.panel ? (
                    m.panel
                  ) : (
                    <>
                      <p
                        className={cn(
                          "truncate font-bold uppercase tracking-wider text-brand-dark/80",
                          largeMetrics ? "text-base" : "text-sm",
                        )}
                      >
                        {m.label}
                      </p>
                      <div
                        className={cn(
                          "truncate font-black tabular-nums tracking-tight text-brand-dark",
                          largeMetrics
                            ? "mt-1 text-3xl leading-tight sm:text-4xl"
                            : "mt-1 text-2xl",
                          m.valueClassName,
                        )}
                      >
                        {m.value}
                      </div>
                      {m.sub != null ? (
                        <p
                          className={cn(
                            "truncate text-stripe-ink-mute font-medium",
                            largeMetrics
                              ? "mt-1 text-base"
                              : "mt-1 text-sm",
                          )}
                        >
                          {m.sub}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {collapsible ? (
        <div className="flex h-6 shrink-0 items-end justify-center">
          <button
            type="button"
            onClick={() => changeCollapsed(true)}
            className="flex h-5 w-16 items-center justify-center rounded-t-full border border-b-0 border-stripe-hairline bg-panel-soft text-stripe-ink-mute shadow-sm transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
            title="Thu gọn thông tin chung và header"
            aria-label="Thu gọn thông tin chung và header"
            aria-expanded={true}
          >
            <UpOutlined className="text-[10px]" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
