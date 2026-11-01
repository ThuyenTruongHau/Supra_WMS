import assert from "node:assert/strict";
import { test } from "node:test";
import dayjs from "dayjs";
import { formatVietnamDateTime, vietnamTime } from "../src/utils/vietnamTime.ts";
import { orderCreatedAtQueryParams } from "../src/utils/orderCreatedAtRangeParams.ts";

for (const browserTimezone of ["UTC", "Asia/Ho_Chi_Minh", "America/New_York"]) {
  test(`Vietnam timestamps and date filters with browser in ${browserTimezone}`, () => {
    const previous = process.env.TZ;
    process.env.TZ = browserTimezone;
    try {
      assert.equal(formatVietnamDateTime("2026-10-31T04:25:14Z"), "31/10/2026 11:25");
      assert.equal(formatVietnamDateTime("2026-10-31T11:25:14+07:00"), "31/10/2026 11:25");
      assert.equal(formatVietnamDateTime("2026-10-31T11:25:14"), "31/10/2026 11:25");
      assert.equal(formatVietnamDateTime("2026-10-31T18:30:00Z"), "01/11/2026 01:30");
      assert.equal(formatVietnamDateTime("2026-11-01", "DD/MM/YYYY"), "01/11/2026");
      assert.equal(vietnamTime("2026-10-31T18:30:00Z").format("YYYYMMDD-HHmmss"), "20261101-013000");
      assert.deepEqual(orderCreatedAtQueryParams([
        dayjs("2026-11-01T00:00:00"), dayjs("2026-11-01T23:59:00"),
      ]), {
        created_from: "2026-10-31T17:00:00.000Z",
        created_to: "2026-11-01T16:59:59.999Z",
      });
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
}

test("missing and invalid timestamps retain a safe display fallback", () => {
  for (const value of [null, undefined, "", "bad-time"]) {
    assert.equal(formatVietnamDateTime(value), "—");
  }
});
