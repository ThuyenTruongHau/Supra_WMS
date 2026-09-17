import type { AssignedItemStock } from "@/types/inboundOrder";

export type ItemBatchAnchorRef = {
  qr_code_id: number;
  item_id: number;
};

export function filterPacksByItemId(
  stocks: AssignedItemStock[],
  itemId: number,
): AssignedItemStock[] {
  return stocks.filter((stock) => stock.item_id === itemId);
}

/** Pack đã link với item QR cụ thể (relation = item qr_code_id). */
export function packLinkedToItemAnchor(
  stock: AssignedItemStock,
  anchor: ItemBatchAnchorRef,
): boolean {
  if (stock.item_id !== anchor.item_id) {
    return false;
  }
  const relation = stock.relation;
  if (relation == null || relation === "") {
    return false;
  }
  if (typeof relation === "string" && relation.trim().toLowerCase() === "item") {
    return false;
  }
  return Number(relation) === anchor.qr_code_id;
}

export function filterLinkedPacksForAnchor(
  stocks: AssignedItemStock[],
  anchor: ItemBatchAnchorRef,
): AssignedItemStock[] {
  return stocks.filter((stock) => packLinkedToItemAnchor(stock, anchor));
}

export function findItemAnchorPending(
  stocks: AssignedItemStock[],
  qrCodeId: number,
): AssignedItemStock | undefined {
  return stocks.find((stock) => stock.qr_code_id === qrCodeId);
}

export type PackerBatchSnapshot = {
  unlinkedForItem: AssignedItemStock[];
  linkedForAnchor: AssignedItemStock[];
  existingItemPending: AssignedItemStock | null;
};

export type PackerBatchFetchResult = {
  snapshot: PackerBatchSnapshot;
  unlinkedItems: AssignedItemStock[];
  linkedItems: AssignedItemStock[];
  itemAnchors: AssignedItemStock[];
};

export function buildPackerBatchSnapshot(
  anchor: ItemBatchAnchorRef,
  unlinkedItems: AssignedItemStock[],
  linkedItems: AssignedItemStock[],
  itemAnchors: AssignedItemStock[],
): PackerBatchSnapshot {
  return {
    unlinkedForItem: filterPacksByItemId(unlinkedItems, anchor.item_id),
    linkedForAnchor: filterLinkedPacksForAnchor(linkedItems, anchor),
    existingItemPending: findItemAnchorPending(itemAnchors, anchor.qr_code_id) ?? null,
  };
}

export function buildPackerBatchFetchResult(
  anchor: ItemBatchAnchorRef,
  unlinkedItems: AssignedItemStock[],
  linkedItems: AssignedItemStock[],
  itemAnchors: AssignedItemStock[],
): PackerBatchFetchResult {
  return {
    snapshot: buildPackerBatchSnapshot(
      anchor,
      unlinkedItems,
      linkedItems,
      itemAnchors,
    ),
    unlinkedItems,
    linkedItems,
    itemAnchors,
  };
}

export function isPackerBatchSnapshotEmpty(snapshot: PackerBatchSnapshot): boolean {
  return (
    snapshot.unlinkedForItem.length === 0 &&
    snapshot.linkedForAnchor.length === 0 &&
    snapshot.existingItemPending === null
  );
}

export function hasAnyPackerPending(
  unlinkedItems: AssignedItemStock[],
  linkedItems: AssignedItemStock[],
  itemAnchors: AssignedItemStock[],
): boolean {
  return (
    unlinkedItems.length > 0 ||
    linkedItems.length > 0 ||
    itemAnchors.length > 0
  );
}

/** Pending exists for this packing user but none matches the scanned item anchor. */
export function findPackerBatchItemMismatch(
  anchor: ItemBatchAnchorRef,
  unlinkedItems: AssignedItemStock[],
  linkedItems: AssignedItemStock[],
  itemAnchors: AssignedItemStock[],
): AssignedItemStock | undefined {
  const all = [...unlinkedItems, ...linkedItems, ...itemAnchors];
  return all.find((stock) => stock.item_id !== anchor.item_id);
}

export type PackerBatchAnchorValidation =
  | { ok: true }
  | { ok: false; reason: "item_mismatch"; pendingStock: AssignedItemStock }
  | { ok: false; reason: "no_pending" };

export function validatePackerBatchForAnchor(
  anchor: ItemBatchAnchorRef,
  fetchResult: PackerBatchFetchResult,
): PackerBatchAnchorValidation {
  const { snapshot, unlinkedItems, linkedItems, itemAnchors } = fetchResult;

  if (!isPackerBatchSnapshotEmpty(snapshot)) {
    return { ok: true };
  }

  if (!hasAnyPackerPending(unlinkedItems, linkedItems, itemAnchors)) {
    return { ok: false, reason: "no_pending" };
  }

  const pendingStock = findPackerBatchItemMismatch(
    anchor,
    unlinkedItems,
    linkedItems,
    itemAnchors,
  );
  if (pendingStock) {
    return { ok: false, reason: "item_mismatch", pendingStock };
  }

  return { ok: false, reason: "no_pending" };
}
