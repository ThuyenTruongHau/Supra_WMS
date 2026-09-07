import type { AssignedItemStock } from "@/types/inboundOrder";
import type { QrTabletInboundMessageKey } from "@/i18n/qrTabletInbound.vi";
import {
  LegacyLotNumberError,
  aggregateLotNumbers,
} from "@/utils/legacyLotNumber";

const STAFF_LIST_SEPARATOR = ",";
const MAX_CAVITY_LENGTH = 50;
const MAX_STAFF_FIELD_LENGTH = 100;

export class PackAggregateError extends Error {
  readonly messageKey: QrTabletInboundMessageKey;

  constructor(messageKey: QrTabletInboundMessageKey) {
    super(messageKey);
    this.name = "PackAggregateError";
    this.messageKey = messageKey;
  }
}

export interface AggregatedItemFromPacks {
  quantity: number;
  unit_id: number;
  lot_number: string;
  cavity_number?: string;
  manufacturing_user: string;
  qc_user?: string;
}

function packLotNumber(stock: AssignedItemStock): string {
  return (stock.lot_number || stock.lot_number_to || "").trim();
}

function unionCommaSeparated(
  values: Array<string | undefined | null>,
  maxLength: number,
): string | undefined {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const raw of values) {
    if (!raw?.trim()) {
      continue;
    }
    for (const part of raw.split(STAFF_LIST_SEPARATOR)) {
      const trimmed = part.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      ordered.push(trimmed);
    }
  }

  if (ordered.length === 0) {
    return undefined;
  }

  const joined = ordered.join(STAFF_LIST_SEPARATOR);
  if (joined.length > maxLength) {
    throw new PackAggregateError("packerAggregateFieldTooLong");
  }
  return joined;
}

function unionCavities(packs: AssignedItemStock[]): string | undefined {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const pack of packs) {
    const cavity = pack.cavity_number?.trim();
    if (!cavity || seen.has(cavity)) {
      continue;
    }
    seen.add(cavity);
    ordered.push(cavity);
  }

  if (ordered.length === 0) {
    return undefined;
  }

  const joined = ordered.join(STAFF_LIST_SEPARATOR);
  if (joined.length > MAX_CAVITY_LENGTH) {
    throw new PackAggregateError("packerAggregateFieldTooLong");
  }
  return joined;
}

export function aggregateAssignedPacks(
  packs: AssignedItemStock[],
  itemId: number,
): AggregatedItemFromPacks {
  if (packs.length === 0) {
    throw new PackAggregateError("packerNoPacksToConfirm");
  }

  for (const pack of packs) {
    if (pack.item_id !== itemId) {
      throw new PackAggregateError("packerItemMismatch");
    }
  }

  const unitId = packs[0].unit_id;
  if (packs.some((pack) => pack.unit_id !== unitId)) {
    throw new PackAggregateError("packerMixedUnit");
  }

  let lotNumber: string;
  try {
    lotNumber = aggregateLotNumbers(packs.map((pack) => packLotNumber(pack)));
  } catch (err) {
    if (err instanceof LegacyLotNumberError) {
      throw new PackAggregateError("packerInvalidLot");
    }
    throw err;
  }

  if (lotNumber.length > 50) {
    throw new PackAggregateError("packerAggregateFieldTooLong");
  }

  const manufacturingUser = unionCommaSeparated(
    packs.map((pack) => pack.manufacturing_user),
    MAX_STAFF_FIELD_LENGTH,
  );
  if (!manufacturingUser) {
    throw new PackAggregateError("packerAggregateFieldTooLong");
  }

  const qcUser = unionCommaSeparated(
    packs.map((pack) => pack.qc_user),
    MAX_STAFF_FIELD_LENGTH,
  );

  return {
    quantity: packs.reduce((sum, pack) => sum + pack.quantity, 0),
    unit_id: unitId,
    lot_number: lotNumber,
    cavity_number: unionCavities(packs),
    manufacturing_user: manufacturingUser,
    qc_user: qcUser,
  };
}
