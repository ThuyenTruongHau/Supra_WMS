import React from "react";
import KpiFilterCardGrid, {
  type KpiFilterCard,
} from "@/components/shared/KpiFilterCardGrid";

export type { KpiFilterCard };

interface HeroProps {
  title: string;
  list?: KpiFilterCard[];
  extra?: React.ReactNode;
  selectedFilterKey?: string | null;
  onFilterKeyChange?: (key: string | null) => void;
  kpiLoading?: boolean;
}

export default function Hero({
  title,
  list,
  extra,
  selectedFilterKey,
  onFilterKeyChange,
  kpiLoading,
}: HeroProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-brand-dark">{title}</h2>
        {extra && <div className="flex items-center gap-3">{extra}</div>}
      </div>

      {list && list.length > 0 && (
        <KpiFilterCardGrid
          cards={list}
          selectedKey={selectedFilterKey}
          onSelectKey={onFilterKeyChange}
          loading={kpiLoading}
        />
      )}
    </div>
  );
}
