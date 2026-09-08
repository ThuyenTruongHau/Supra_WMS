import type { ItemOutbound, OutboundDetailGroup } from "@/types/outbound";
import { sumItemPallets } from "@/utils/palletQuantity";

export type CustomerUnderVehicle = {
  key: string;
  group: OutboundDetailGroup;
  customer_name: string;
  itemCount: number;
  palletCount: number;
  items: ItemOutbound[];
};

export type VehicleViewNode = {
  key: string;
  vehicle_number: string;
  trip_code: string | null;
  carrier_name: string | null;
  customerCount: number;
  itemCount: number;
  palletCount: number;
  customers: CustomerUnderVehicle[];
};

export type VehicleInfoBlock = {
  key: string;
  group: OutboundDetailGroup;
  vehicle_number: string;
  carrier_name: string | null;
  trip_code: string | null;
  itemCount: number;
  palletCount: number;
  items: ItemOutbound[];
};

export type CustomerViewNode = {
  key: string;
  customer_name: string;
  vehicleCount: number;
  itemCount: number;
  palletCount: number;
  vehicles: VehicleInfoBlock[];
};

function flattenItems(groups: OutboundDetailGroup[]): ItemOutbound[] {
  return groups.flatMap((group) => group.items);
}

function countDistinctCustomers(groups: OutboundDetailGroup[]): number {
  return new Set(groups.map((group) => group.customer_name.trim())).size;
}

function countDistinctVehicles(groups: OutboundDetailGroup[]): number {
  return new Set(groups.map((group) => group.vehicle_number.trim())).size;
}

function pickDominantTrip(groups: OutboundDetailGroup[]): string | null {
  for (const group of groups) {
    if (group.trip_code?.trim()) return group.trip_code.trim();
  }
  return null;
}

function pickDominantCarrier(groups: OutboundDetailGroup[]): string | null {
  for (const group of groups) {
    if (group.carrier_name?.trim()) return group.carrier_name.trim();
  }
  return null;
}

export function groupDetailGroupsByVehicle(
  detailGroups: OutboundDetailGroup[],
): VehicleViewNode[] {
  const vehicleMap = new Map<string, OutboundDetailGroup[]>();

  for (const group of detailGroups) {
    const vehicleKey = group.vehicle_number.trim();
    const existing = vehicleMap.get(vehicleKey) ?? [];
    existing.push(group);
    vehicleMap.set(vehicleKey, existing);
  }

  return [...vehicleMap.entries()]
    .map(([vehicleNumber, groups]) => {
      const allItems = flattenItems(groups);
      const customers: CustomerUnderVehicle[] = groups.map((group) => ({
        key: String(group.id),
        group,
        customer_name: group.customer_name,
        itemCount: group.items.length,
        palletCount: sumItemPallets(group.items),
        items: group.items,
      }));

      return {
        key: vehicleNumber,
        vehicle_number: vehicleNumber,
        trip_code: pickDominantTrip(groups),
        carrier_name: pickDominantCarrier(groups),
        customerCount: countDistinctCustomers(groups),
        itemCount: allItems.length,
        palletCount: sumItemPallets(allItems),
        customers,
      };
    })
    .sort((a, b) => a.vehicle_number.localeCompare(b.vehicle_number));
}

export function groupDetailGroupsByCustomer(
  detailGroups: OutboundDetailGroup[],
): CustomerViewNode[] {
  const customerMap = new Map<string, OutboundDetailGroup[]>();

  for (const group of detailGroups) {
    const customerKey = group.customer_name.trim();
    const existing = customerMap.get(customerKey) ?? [];
    existing.push(group);
    customerMap.set(customerKey, existing);
  }

  return [...customerMap.entries()]
    .map(([customerName, groups]) => {
      const allItems = flattenItems(groups);
      const vehicles: VehicleInfoBlock[] = groups.map((group) => ({
        key: String(group.id),
        group,
        vehicle_number: group.vehicle_number,
        carrier_name: group.carrier_name,
        trip_code: group.trip_code,
        itemCount: group.items.length,
        palletCount: sumItemPallets(group.items),
        items: group.items,
      }));

      return {
        key: customerName,
        customer_name: customerName,
        vehicleCount: countDistinctVehicles(groups),
        itemCount: allItems.length,
        palletCount: sumItemPallets(allItems),
        vehicles,
      };
    })
    .sort((a, b) => a.customer_name.localeCompare(b.customer_name));
}
