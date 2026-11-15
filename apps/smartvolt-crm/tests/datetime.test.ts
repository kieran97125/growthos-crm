import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHongKongDateTime } from "../src/lib/datetime";

test("report cutoff keeps Hong Kong midnight and explicit seconds", () => {
  assert.equal(
    formatHongKongDateTime("2026-11-14T16:05:06Z", "second"),
    "2026-11-15 00:05:06",
  );
  assert.equal(
    formatHongKongDateTime("2026-11-15T00:05:06+08:00", "second"),
    "2026-11-15 00:05:06",
  );
  assert.equal(
    formatHongKongDateTime("2024-02-29T15:59:59Z"),
    "2024-02-29 23:59",
  );
});

test("displayed source times are independent of the server or device default zone", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Los_Angeles", "Asia/Hong_Kong"]) {
      process.env.TZ = zone;
      assert.equal(
        formatHongKongDateTime("2026-11-14T12:00:00Z", "second"),
        "2026-11-14 20:00:00",
      );
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("unavailable source times render explicitly without crashing the workspace", () => {
  assert.equal(formatHongKongDateTime("invalid"), "—");
  assert.equal(formatHongKongDateTime(""), "—");
});
