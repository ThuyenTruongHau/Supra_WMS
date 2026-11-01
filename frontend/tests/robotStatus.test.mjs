import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRobotStatusRows } from "../src/utils/robotStatus.ts";

const fl01 = "EE49822BAK00001";
const fl02 = "EE49822BAK00002";

test("matches FK robots by deviceCode, ignores other robots and preserves display order", () => {
  const rows = buildRobotStatusRows([
    { deviceCode: "EL21490AAK00026", state: "InTask" },
    { deviceCode: fl02, deviceName: "FL2", state: "InCharging" },
    { deviceCode: fl01, deviceName: "FL1", state: "Idle" },
  ]);
  assert.deepEqual(rows, [
    { id: "FL 01", status: "Rảnh", tone: "idle" },
    { id: "FL 02", status: "Đang sạc", tone: "charging" },
  ]);
});

test("maps each known state and follows a robot's changing status", () => {
  for (const [state, status, tone] of [
    ["Idle", "Rảnh", "idle"],
    ["InTask", "Làm nhiệm vụ", "task"],
    ["InCharging", "Đang sạc", "charging"],
    ["Offline", "Mất kết nối", "offline"],
  ]) {
    assert.deepEqual(buildRobotStatusRows([{ deviceCode: fl01, state }])[0], {
      id: "FL 01", status, tone,
    });
  }
});

test("accepts minimal Offline telemetry without battery or position", () => {
  assert.deepEqual(buildRobotStatusRows([{ deviceCode: fl02, state: "Offline", deviceStatus: 0 }])[1], {
    id: "FL 02", status: "Mất kết nối", tone: "offline",
  });
});

test("uses deviceStatus only when state is absent or blank", () => {
  for (const [deviceStatus, status] of [[0, "Mất kết nối"], [1, "Rảnh"], [4, "Làm nhiệm vụ"], [5, "Đang sạc"]]) {
    for (const code of [deviceStatus, String(deviceStatus)]) {
      assert.equal(buildRobotStatusRows([{ deviceCode: fl01, deviceStatus: code }])[0].status, status);
      assert.equal(buildRobotStatusRows([{ deviceCode: fl01, state: " ", deviceStatus: code }])[0].status, status);
    }
  }
  assert.equal(buildRobotStatusRows([{ deviceCode: fl01, state: "Idle", deviceStatus: 4 }])[0].status, "Rảnh");
});

test("preserves unknown state labels even when deviceStatus has a known value", () => {
  for (const state of ["Paused", "EmergencyStop", "constructor", "toString"]) {
    assert.deepEqual(buildRobotStatusRows([{ deviceCode: fl01, state, deviceStatus: 4 }])[0], {
      id: "FL 01", status: state, tone: "unknown",
    });
  }
});

test("does not interpret missing or unknown numeric status as Offline", () => {
  for (const deviceStatus of [undefined, null, "", " ", 9, "unknown"]) {
    assert.deepEqual(buildRobotStatusRows([{ deviceCode: fl01, deviceStatus }])[0], {
      id: "FL 01", status: "Không rõ trạng thái", tone: "unknown",
    });
  }
});

test("keeps both names visible when the list is empty or one robot is missing", () => {
  assert.deepEqual(buildRobotStatusRows([]), [
    { id: "FL 01", status: "Không có dữ liệu", tone: "unknown" },
    { id: "FL 02", status: "Không có dữ liệu", tone: "unknown" },
  ]);
  assert.equal(buildRobotStatusRows([{ deviceCode: fl01, state: "Idle" }])[1].status, "Không có dữ liệu");
});

test("shows initial loading and hides cached statuses on API failure", () => {
  const robots = [{ deviceCode: fl01, state: "InTask" }, { deviceCode: fl02, state: "Idle" }];
  assert.deepEqual(buildRobotStatusRows(undefined, { isLoading: true }).map((row) => row.status), ["Đang tải…", "Đang tải…"]);
  assert.deepEqual(buildRobotStatusRows(robots, { isError: true }).map((row) => row.status), ["Không có dữ liệu", "Không có dữ liệu"]);
});

test("converts numeric and string speeds from mm/s to m/s, including measured zero", () => {
  const rows = buildRobotStatusRows([
    { deviceCode: fl02, state: "Idle", speed: "0" },
    { deviceCode: fl01, state: "InTask", speed: " 750 " },
  ]);
  assert.equal(rows[0].speed, 0.8);
  assert.equal(rows[1].speed, 0);
  assert.equal(buildRobotStatusRows([{ deviceCode: fl01, speed: 1200 }])[0].speed, 1.2);
});

test("rounds m/s to one decimal and omits trailing decimal zeros", () => {
  for (const [speed, expected] of [[1001, 1], [1234, 1.2], [1260, 1.3], [49, 0], [51, 0.1]]) {
    const row = buildRobotStatusRows([{ deviceCode: fl01, speed }])[0];
    assert.equal(row.speed, expected);
  }
});

test("keeps missing, blank and invalid speeds unknown instead of showing zero", () => {
  for (const speed of [undefined, null, "", " ", "invalid", "Infinity", NaN, Infinity]) {
    assert.equal(buildRobotStatusRows([{ deviceCode: fl01, speed }])[0].speed, undefined);
  }
});

test("hides stale speeds while loading or when telemetry is unavailable", () => {
  const robots = [{ deviceCode: fl01, state: "InTask", speed: "800" }];
  for (const options of [{ isLoading: true }, { isError: true }]) {
    assert.equal(buildRobotStatusRows(robots, options)[0].speed, undefined);
  }
  assert.equal(buildRobotStatusRows([])[0].speed, undefined);
});
