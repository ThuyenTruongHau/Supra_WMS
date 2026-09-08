import type { ItemAvailableUnitOption } from "@/types/itemUnit";

export type UnitSelectOption = {
  value: number;
  label: string;
  unit_name: string;
  is_base_unit?: boolean;
  conversion_factor?: number | null;
  suggested_quantity?: number;
  base_unit_name?: string;
};

export function formatUnitSelectOptions(
  units: ItemAvailableUnitOption[],
  baseUnitName: string,
  baseQuantity = 1,
): UnitSelectOption[] {
  const normalizedBaseQty = baseQuantity > 0 ? baseQuantity : 1;

  return units.map((unit) => {
    let suggested_quantity = 1;

    if (unit.is_base_unit) {
      suggested_quantity = normalizedBaseQty;
    }

    return {
      value: unit.unit_id,
      label: unit.unit_name,
      unit_name: unit.unit_name,
      is_base_unit: unit.is_base_unit,
      conversion_factor: unit.conversion_factor,
      suggested_quantity,
      base_unit_name: baseUnitName,
    };
  });
}

export function suggestQuantityForUnitOption(
  unitId: number,
  options: UnitSelectOption[],
  fallback = 1,
): number {
  const match = options.find((option) => option.value === unitId);
  if (!match?.suggested_quantity || match.suggested_quantity <= 0) {
    return fallback > 0 ? fallback : 1;
  }
  return match.suggested_quantity;
}

export function findUnitSelectOption(
  options: UnitSelectOption[],
  unitId: number,
): UnitSelectOption | undefined {
  return options.find((option) => option.value === unitId);
}
