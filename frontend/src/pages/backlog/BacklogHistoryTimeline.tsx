import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import InboundStatusTag from "@/components/shared/InboundStatusTag";
import { translateStatus } from "@/i18n/statusLabels.vi";
import type {
  HistoryRecord,
  TransactionHistoryItem,
  TransactionHistoryLookupResponse,
} from "@/types/transactionHistory";
import { formatQuantity } from "@/utils/formatQuantity";
import {
  flattenDetailsToRows,
  formatDateTime,
  formatLocation,
} from "./backlogFormatters";

/** ~1/3 viewport — sits in one half of the alternating timeline row. */
const CARD_WIDTH_CLASS = "w-full md:w-2/3";

function TimelineCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm">
      <p className="text-left text-base font-bold text-brand-dark">{title}</p>
      <div className="mt-1 text-left text-sm font-semibold text-brand-primary">
        {subtitle}
      </div>
      <div className="mt-3 space-y-1.5 text-left text-sm text-slate-600">
        {children}
      </div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-left">
      <span className="font-medium text-slate-700">{label}:</span> {value}
    </p>
  );
}

function TimelineSpine({
  step,
  isLast,
}: {
  step: number;
  isLast: boolean;
}) {
  return (
    <div className="relative flex flex-col items-center self-stretch px-1">
      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold text-brand-primary shadow-md shadow-brand-primary/15 ring-2 ring-brand-primary/20">
        {step}
      </div>
      {!isLast ? (
        <div className="absolute top-10 bottom-0 w-0.5 bg-brand-primary/30" />
      ) : null}
      <div className="absolute top-5 h-3 w-3 rounded-full border-2 border-brand-primary bg-white" />
    </div>
  );
}

type TimelineItemProps = {
  index: number;
  isLast: boolean;
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
};

function TimelineItem({
  index,
  isLast,
  title,
  subtitle,
  children,
}: TimelineItemProps) {
  const isLeft = index % 2 === 0;
  const step = index + 1;

  return (
    <div className="relative pb-10 last:pb-0">
      {/* Desktop: spine giữa, card xen kẽ trái/phải */}
      <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] md:items-start">
        <div
          className={cn(
            "flex min-w-0 items-center gap-3 pr-4",
            isLeft ? "justify-end" : "",
          )}
        >
          {isLeft ? (
            <>
              <div className={cn("min-w-0 text-left", CARD_WIDTH_CLASS)}>
                <TimelineCard title={title} subtitle={subtitle}>
                  {children}
                </TimelineCard>
              </div>
              <div className="h-px w-8 shrink-0 border-t border-dashed border-brand-primary/40" />
            </>
          ) : null}
        </div>

        <TimelineSpine step={step} isLast={isLast} />

        <div
          className={cn(
            "flex min-w-0 items-center gap-3 pl-4",
            !isLeft ? "justify-start" : "",
          )}
        >
          {!isLeft ? (
            <>
              <div className="h-px w-8 shrink-0 border-t border-dashed border-brand-primary/40" />
              <div className={cn("min-w-0 text-left", CARD_WIDTH_CLASS)}>
                <TimelineCard title={title} subtitle={subtitle}>
                  {children}
                </TimelineCard>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Mobile: spine trái, card phải */}
      <div className="flex items-start gap-3 md:hidden">
        <TimelineSpine step={step} isLast={isLast} />
        <div className="min-w-0 flex-1 pb-1 text-left">
          <TimelineCard title={title} subtitle={subtitle}>
            {children}
          </TimelineCard>
        </div>
      </div>
    </div>
  );
}

function TransactionTimelineItem({
  item,
  index,
  isLast,
}: {
  item: TransactionHistoryItem;
  index: number;
  isLast: boolean;
}) {
  return (
    <TimelineItem
      index={index}
      isLast={isLast}
      title={formatDateTime(item.created_at)}
      subtitle={translateStatus(item.transaction_type)}
    >
      <DetailLine
        label="Từ vị trí"
        value={formatLocation(
          item.from_location_code,
          item.from_location_name,
        )}
      />
      <DetailLine
        label="Đến vị trí"
        value={formatLocation(item.to_location_code, item.to_location_name)}
      />
      <DetailLine label="Số lượng" value={formatQuantity(item.quantity)} />
    </TimelineItem>
  );
}

function HistoryTimelineItem({
  item,
  index,
  isLast,
}: {
  item: HistoryRecord;
  index: number;
  isLast: boolean;
}) {
  const detailRows = flattenDetailsToRows(item.details);

  return (
    <TimelineItem
      index={index}
      isLast={isLast}
      title={formatDateTime(item.created_at)}
      subtitle={
        <span className="inline-flex flex-wrap items-center justify-start gap-2">
          <InboundStatusTag status={item.old_status} size="sm" />
          <span className="text-slate-400">→</span>
          <InboundStatusTag status={item.new_status} size="sm" />
        </span>
      }
    >
      {item.description ? (
        <DetailLine label="Mô tả" value={item.description} />
      ) : null}
      {detailRows.map((row) =>
        row.isJson ? (
          <div key={row.label} className="text-left">
            <p className="font-medium text-slate-700">{row.label}:</p>
            <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-slate-50 p-2 text-left text-xs text-slate-600 ring-1 ring-slate-200">
              {row.value}
            </pre>
          </div>
        ) : (
          <DetailLine key={row.label} label={row.label} value={row.value} />
        ),
      )}
    </TimelineItem>
  );
}

type BacklogHistoryTimelineProps = {
  data: TransactionHistoryLookupResponse;
};

export default function BacklogHistoryTimeline({
  data,
}: BacklogHistoryTimelineProps) {
  if (data.lookup_type === "qr_code") {
    const items = data.transactions;

    return (
      <section>
        <h3 className="mb-6 text-lg font-semibold text-brand-dark">
          Lịch sử giao dịch
          {items.length > 0 ? (
            <span className="ml-2 text-base font-normal text-slate-500">
              ({items.length})
            </span>
          ) : null}
        </h3>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Không có giao dịch</p>
        ) : (
          <div className="relative w-full">
            {items.map((item, index) => (
              <TransactionTimelineItem
                key={item.id}
                item={item}
                index={index}
                isLast={index === items.length - 1}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  const items = data.histories;

  return (
    <section>
      <h3 className="mb-6 text-lg font-semibold text-brand-dark">
        Lịch sử trạng thái
        {items.length > 0 ? (
          <span className="ml-2 text-base font-normal text-slate-500">
            ({items.length})
          </span>
        ) : null}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Không có lịch sử</p>
      ) : (
        <div className="relative w-full">
          {items.map((item, index) => (
            <HistoryTimelineItem
              key={item.id}
              item={item}
              index={index}
              isLast={index === items.length - 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}
