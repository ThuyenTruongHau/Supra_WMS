import { cn } from "@/components/ui";

export type KpiFilterCard = {
  key?: string;
  label: string;
  value: string;
  color: string;
  /** KPI chỉ xem, không click lọc */
  filterable?: boolean;
};

type KpiFilterCardGridProps = {
  cards: KpiFilterCard[];
  selectedKey?: string | null;
  onSelectKey?: (key: string | null) => void;
  loading?: boolean;
  className?: string;
};

const gridCols: Record<number, string> = {
  1: "xl:grid-cols-1",
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
};

export default function KpiFilterCardGrid({
  cards,
  selectedKey = null,
  onSelectKey,
  loading = false,
  className,
}: KpiFilterCardGridProps) {
  const interactive = Boolean(onSelectKey);
  const currentGridClass = gridCols[cards.length] ?? "xl:grid-cols-4";

  const cardKey = (card: KpiFilterCard) => card.key ?? card.label;

  const handleClick = (card: KpiFilterCard) => {
    if (!onSelectKey || card.filterable === false) return;
    const key = cardKey(card);

    if (key === "all") {
      onSelectKey(null);
      return;
    }

    if (selectedKey === key) {
      onSelectKey(null);
    } else {
      onSelectKey(key);
    }
  };

  return (
    <div
      className={cn(
        `grid grid-cols-1 gap-4 sm:grid-cols-2 ${currentGridClass}`,
        className,
      )}
    >
      {cards.map((card) => {
        const key = cardKey(card);
        const isFilterable = interactive && card.filterable !== false;
        const isSelected =
          isFilterable && key !== "all" && selectedKey === key;

        return (
          <button
            key={key}
            type="button"
            disabled={!isFilterable}
            onClick={() => handleClick(card)}
            className={cn(
              "rounded-xl bg-white p-5 text-left shadow-sm transition-all",
              isFilterable && "cursor-pointer hover:shadow-md",
              !isFilterable && "cursor-default",
              isSelected &&
                "ring-2 ring-brand-primary ring-offset-2 shadow-md",
            )}
          >
            <p className="text-sm text-gray-500">{card.label}</p>
            <p
              className="mt-2 text-3xl font-bold"
              style={{ color: card.color }}
            >
              {loading ? "..." : card.value}
            </p>
          </button>
        );
      })}
    </div>
  );
}
