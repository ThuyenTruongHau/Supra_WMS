import assert from "node:assert/strict";
import { test } from "node:test";
import {
  pickReadyReturnTasks,
  buildReturnExecuteBody,
  filterReturnTasksByFromLocationId,
  returnTaskFromLocationId,
} from "../src/utils/masanSortingReturnTasks.ts";

const allocation = (id, status, detailId = 1) => ({
  id,
  outbound_order_detail_id: detailId,
  status,
  quantity: 12,
  from_location_id: 101,
  to_location_id: 102,
});

const task = (orderId, taskType, allocations, status = "initialize") => ({
  order_id: orderId,
  task_type: taskType,
  status,
  quantity: 12,
  allocations,
});

test("a successful retry allows return despite earlier failed and cancelled attempts", () => {
  const returned = task("return-1", "return", [allocation(4, "initialize")]);
  const all = [
    task("old-failed", "outbound", [allocation(1, "failed")], "failed"),
    task("old-cancelled", "outbound", [allocation(2, "cancelled")], "cancelled"),
    task("successful-retry", "outbound", [allocation(3, "completed")], "completed"),
    returned,
  ];
  assert.deepEqual(pickReadyReturnTasks(29, [returned], all), [{ outboundOrderId: 29, task: returned }]);
});

test("return stays blocked while a live outbound allocation still needs confirmation", () => {
  const returned = task("return-1", "return", [allocation(4, "initialize")]);
  for (const status of ["initialize", "issued", "in_progress", "pre_completed", "confirmed"]) {
    const outbound = task("pending", "outbound", [allocation(3, status)], status);
    assert.deepEqual(pickReadyReturnTasks(29, [returned], [outbound, returned]), []);
  }
});

test("a cancelled return is not offered for execution", () => {
  const returned = task("cancelled-return", "return", [allocation(4, "cancelled")]);
  assert.deepEqual(pickReadyReturnTasks(29, [returned], [returned]), []);
});

test("failed attempts alone never make an orphan return ready", () => {
  const returned = task("orphan-return", "return", [allocation(4, "initialize")]);
  const failed = task("failed-outbound", "outbound", [allocation(1, "failed")], "failed");
  assert.deepEqual(pickReadyReturnTasks(29, [returned], [failed, returned]), []);
});

test("filterReturnTasksByFromLocationId keeps only matching VT", () => {
  const returned = task("return-1", "return", [allocation(4, "initialize")]);
  const rows = [{ outboundOrderId: 29, task: returned }];
  assert.equal(returnTaskFromLocationId(returned), 101);
  assert.deepEqual(filterReturnTasksByFromLocationId(rows, 101), rows);
  assert.deepEqual(filterReturnTasksByFromLocationId(rows, 999), []);
  assert.deepEqual(filterReturnTasksByFromLocationId(rows, null), rows);
});

test("execute keeps the return task orderId and explicit source and destination", () => {
  const returned = task("return-1", "return", [allocation(4, "initialize")]);
  assert.deepEqual(buildReturnExecuteBody(returned), {
    order_id: "return-1",
    from_location_id: 101,
    to_location_id: 102,
    allocations: [{ allocation_id: 4 }],
  });
  returned.allocations[0].to_location_id = null;
  assert.equal(buildReturnExecuteBody(returned), null);
});
