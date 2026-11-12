import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fromHongKongInput,
  toHongKongInput,
  threadOperationsSchema,
  inboxQuerySchema,
} from "../src/lib/meta/operations";

test("follow-up input uses Hong Kong time across day boundaries and rejects calendar overflow", () => {
  assert.equal(
    fromHongKongInput("2026-11-13T00:15"),
    "2026-11-12T16:15:00.000Z",
  );
  assert.equal(toHongKongInput("2026-11-12T16:15:00Z"), "2026-11-13T00:15");
  assert.equal(fromHongKongInput(""), null);
  assert.throws(() => fromHongKongInput("2026-02-30T12:30"));
  assert.throws(() => fromHongKongInput("2026-11-13 00:15"));
  assert.equal(toHongKongInput("invalid"), "");
});
test("inbox commands reject identity injection, oversized data and unsupported filters", () => {
  const data = {
    customer_name: "  Example  ",
    assignee_id: null,
    priority: "high",
    follow_up_at: null,
    next_step: "了解需要",
    status: "open",
  };
  assert.equal(threadOperationsSchema.parse(data).customer_name, "Example");
  for (const patch of [
    { actor_id: "injected" },
    { next_step: "x".repeat(501) },
    { assignee_id: "other-user" },
    { follow_up_at: "tomorrow" },
    { status: "hidden" },
  ])
    assert.equal(
      threadOperationsSchema.safeParse({ ...data, ...patch }).success,
      false,
    );
  assert.equal(inboxQuerySchema.safeParse({ queue: "foreign" }).success, false);
  assert.equal(
    inboxQuerySchema.safeParse({ search: "x".repeat(101) }).success,
    false,
  );
  assert.equal(inboxQuerySchema.parse({}).queue, "all");
});
