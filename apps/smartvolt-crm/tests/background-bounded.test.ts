import { test } from "node:test";
import assert from "node:assert/strict";
import { runBounded } from "../src/lib/engagement/bounded";
test("background batching bounds concurrency and settles admitted peers before reporting failure", async () => {
  let active = 0,
    peak = 0,
    completed = 0;
  await assert.rejects(
    runBounded(
      Array.from({ length: 53 }, (_, i) => i),
      5,
      async (i) => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        completed++;
        if (i === 7 || i === 29) throw Error("Synthetic finish failure");
      },
    ),
    AggregateError,
  );
  assert.equal(peak, 5);
  assert.equal(active, 0);
  assert.equal(completed, 53);
});
