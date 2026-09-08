import { useMemo, useState } from "react";
import { Select } from "@/components/ui";
import type { UnitSelectOption } from "@/utils/itemUnitDisplay";
import { cn } from "@/components/ui/utils/cn";

type UnitSearchSelectProps = {
  value?: number;
  options: UnitSelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onChange?: (unitId: number, option?: UnitSelectOption) => void;
};

function matchesUnitQuery(option: UnitSelectOption, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    option.unit_name.toLowerCase().includes(normalized) ||
    option.label.toLowerCase().includes(normalized)
  );
}

/** Select đơn vị có tìm kiếm — gợi ý từ 1 ký tự. */
export function UnitSearchSelect({
  value,
  options,
  placeholder = "Chọn đơn vị",
  className,
  disabled,
  onChange,
}: UnitSearchSelectProps) {
  const [searchText, setSearchText] = useState("");

  const filteredOptions = useMemo(() => {
    if (!searchText.trim()) return options;
    return options.filter((option) => matchesUnitQuery(option, searchText));
  }, [options, searchText]);

  return (
    <Select
      className={cn("w-full", className)}
      showSearch
      optionFilterProp="label"
      filterOption={false}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      options={filteredOptions}
      onSearch={setSearchText}
      onChange={(val) => {
        const unitId = Number(val);
        const selected = options.find((option) => option.value === unitId);
        onChange?.(unitId, selected);
      }}
      notFoundContent={
        searchText.trim()
          ? "Không có đơn vị phù hợp"
          : "Không có đơn vị"
      }
    />
  );
}
