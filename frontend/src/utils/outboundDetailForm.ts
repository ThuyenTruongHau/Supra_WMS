import type {
  DetailGroupInput,
  ItemOutboundInput,
  OutboundDetailGroup,
} from "@/types/outbound";
import {
  parseNonNegativeInteger,
  parsePositiveInteger,
  toInteger,
} from "@/utils/number";
import { resolveTotalAndPalletCount } from "@/utils/palletQuantity";

export type ItemLineFormValues = {
  product_id?: number;
  requested_quantity?: number;
  pallet_quantity?: number;
};

export type DetailGroupFormValues = {
  customer_name?: string;
  vehicle_number?: string;
  carrier_name?: string;
  trip_code?: string;
  lot_number?: string;
  items?: ItemLineFormValues[];
};

export function detailGroupToFormValues(
  group: OutboundDetailGroup,
): DetailGroupFormValues {
  return {
    customer_name: group.customer_name,
    vehicle_number: group.vehicle_number,
    carrier_name: group.carrier_name ?? undefined,
    trip_code: group.trip_code ?? undefined,
    lot_number: group.lot_number ?? undefined,
    items: group.items.map((item) => ({
      product_id: item.product_id,
      requested_quantity: toInteger(item.requested_quantity),
      pallet_quantity:
        item.pallet_quantity != null
          ? toInteger(item.pallet_quantity)
          : undefined,
    })),
  };
}

export function buildItemInputFromFormLine(
  line: ItemLineFormValues,
): ItemOutboundInput | null {
  if (!line.product_id || line.requested_quantity == null) {
    return null;
  }

  const requestedQuantity = parsePositiveInteger(line.requested_quantity);
  if (requestedQuantity == null) {
    return null;
  }

  if (line.pallet_quantity != null) {
    const parsedPallet = parseNonNegativeInteger(line.pallet_quantity);
    if (parsedPallet == null) {
      return null;
    }
    const { totalQuantity, palletCount } = resolveTotalAndPalletCount(
      requestedQuantity,
      parsedPallet,
    );
    return {
      product_id: line.product_id,
      requested_quantity: totalQuantity,
      pallet_quantity: palletCount,
      locator: null,
    };
  }

  return {
    product_id: line.product_id,
    requested_quantity: requestedQuantity,
    pallet_quantity: null,
    locator: null,
  };
}

export function buildDetailGroupsFromForm(
  groups: DetailGroupFormValues[] | undefined,
): DetailGroupInput[] {
  const result: DetailGroupInput[] = [];

  for (const group of groups ?? []) {
    const items = (group.items ?? [])
      .map((line) => buildItemInputFromFormLine(line))
      .filter((line): line is ItemOutboundInput => line != null);

    if (
      !group.customer_name?.trim() ||
      !group.vehicle_number?.trim() ||
      items.length === 0
    ) {
      continue;
    }

    result.push({
      customer_name: group.customer_name.trim(),
      vehicle_number: group.vehicle_number.trim(),
      carrier_name: group.carrier_name?.trim() || null,
      trip_code: group.trip_code?.trim() || null,
      lot_number: group.lot_number?.trim() || null,
      items,
    });
  }

  return result;
}

export const defaultDetailGroupFormValues: DetailGroupFormValues = {
  items: [{ requested_quantity: 1 }],
};
