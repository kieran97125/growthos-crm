import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHEDULE_CLOUD_EVENT_TYPE } from "@vercel/schedules";
import { scheduledMaintenance } from "../src/lib/engagement/scheduled-maintenance";
// The platform's private function target is the production access boundary.
// This test checks the real SDK parser, metadata selection and execution outcome.
const headers = {
  "ce-specversion": "1.0",
  "ce-type": SCHEDULE_CLOUD_EVENT_TYPE,
  "ce-source": "synthetic-scheduler",
  "ce-id": "synthetic-execution",
  "ce-vssscheduledat": "2026-11-15T00:00:00Z",
  "ce-vssscheduleid": "synthetic-id",
  "ce-vssschedulename": "convelta-maintenance",
  "ce-vssnamespace": "default",
  "ce-vssschedulesource": "static",
  "ce-vssexpression": "*/15 * * * *",
};
test("the actual schedule SDK rejects ordinary HTTP requests before running maintenance", async () => {
  let calls = 0;
  const h = scheduledMaintenance(async () => {
    calls++;
    return { checked: 0, completed: 0, failed: 0 };
  });
  assert.equal(
    (
      await h(
        new Request("https://synthetic.invalid/internal", { method: "POST" }),
      )
    ).status,
    400,
  );
  assert.equal(calls, 0);
});
test("the named private schedule runs once and reports partial failures as unsuccessful", async () => {
  let calls = 0;
  const h = scheduledMaintenance(async () => {
    calls++;
    return { checked: 1, completed: 1, failed: 0 };
  });
  assert.equal(
    (
      await h(
        new Request("https://synthetic.invalid/internal", {
          method: "POST",
          headers,
        }),
      )
    ).status,
    200,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    scheduledMaintenance(async () => ({ checked: 1, completed: 0, failed: 1 }))(
      new Request("https://synthetic.invalid/internal", {
        method: "POST",
        headers,
      }),
    ),
    /reconciliation/,
  );
});
