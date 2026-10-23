import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confirmableAllocationsForCcLocationId,
  pendingAllocationsForCcLocationId,
} from "../src/utils/masanPendingStockOverlay.ts";

const allocation = (id, status, toLocationId, extra = {}) => ({
  id,
  outbound_order_detail_id: id,
  item_stock_id: id,
  quantity: 10,
  status,
  allocation_type: "outbound",
  robot_task_id: id,
  from_location_id: 1,
  to_location_id: toLocationId,
  sku: `SKU-${id}`,
  ...extra,
});

const pendingStock = {
  warehouse_id: 1,
  zone: "Zone_CC_01",
  locations: [
    {
      location_id: 10,
      location_name: "CC01",
      allocations: [
        allocation(401, "pre_completed", 100),
        allocation(402, "pre_completed", 101),
        allocation(403, "completed", 100),
        allocation(404, "confirmed", 100),
      ],
    },
    {
      location_id: 11,
      location_name: "CC02",
      allocations: [allocation(501, "pre_completed", 100)],
    },
  ],
};

const ccCodes = new Map([
  [10, "CC-10"],
  [11, "CC-11"],
]);

test("confirmable CC lines keep only pre_completed allocations of that CC", () => {
  const rows = confirmableAllocationsForCcLocationId(
    pendingStock,
    10,
    ccCodes,
  );
  assert.deepEqual(
    rows.map((row) => row.id).sort((a, b) => a - b),
    [401, 402],
  );
  assert.equal(
    rows.every((row) => row.ccLocationId === 10),
    true,
  );
});

test("confirmable CC lines can be narrowed to the selected VT destination", () => {
  const rows = confirmableAllocationsForCcLocationId(
    pendingStock,
    10,
    ccCodes,
    { locationCode: "CC-10", locationName: "CC01" },
    100,
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    [401],
  );
});

test("confirmable CC lines stay empty when the selected VT has no stock for that CC", () => {
  const rows = confirmableAllocationsForCcLocationId(
    pendingStock,
    10,
    ccCodes,
    undefined,
    999,
  );
  assert.deepEqual(rows, []);
});

test("bucket helper still returns non-confirmable allocations for the CC detail modal", () => {
  const rows = pendingAllocationsForCcLocationId(pendingStock, 10, ccCodes);
  assert.deepEqual(
    rows.map((row) => row.id).sort((a, b) => a - b),
    [401, 402, 403, 404],
  );
});
