import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFeedbackEvent,
  postFeedback,
  verifyDestination,
  type AdmittedFeedback,
} from "../src/lib/feedback/graph";
const actual: AdmittedFeedback = {
  eventId: "a".repeat(64),
  eventName: "Purchase",
  eventTime: Math.floor(Date.now() / 1000) - 10,
  amountCents: 12345,
  currency: "HKD",
  phone: "+85260000001",
  email: "Example@Example.invalid",
  customerId: "actual-source-id",
  brandId: "brand",
};
test("Meta payload hashes normalized authorized identity, preserves actual time and money and does not invent conversion channel", () => {
  const event = buildFeedbackEvent("company", actual);
  assert.equal(event.custom_data?.value, 123.45);
  assert.equal(event.event_time, actual.eventTime);
  assert.equal(event.action_source, "other");
  assert.match(event.user_data.ph[0], /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(event).includes(actual.phone), false);
  assert.equal(JSON.stringify(event).includes(actual.email), false);
  assert.throws(
    () =>
      buildFeedbackEvent("company", {
        ...actual,
        phone: "60000001",
        email: "",
      }),
    /matching/,
  );
  assert.throws(
    () =>
      buildFeedbackEvent("company", {
        ...actual,
        eventTime: Math.floor(Date.now() / 1000) + 60,
      }),
    /expired/,
  );
  assert.throws(
    () =>
      buildFeedbackEvent("company", {
        ...actual,
        eventTime: Math.floor(Date.now() / 1000) - 8 * 86400,
      }),
    /expired/,
  );
  assert.throws(
    () => buildFeedbackEvent("company", { ...actual, amountCents: 0 }),
    /payment/,
  );
});
test("destination verification checks both business ownership chains using the fixed provider and rejects mismatch", async () => {
  const urls: string[] = [];
  const mock: typeof fetch = async (input, init) => {
    const u = new URL(String(input));
    urls.push(u.href);
    assert.equal(u.hostname, "graph.facebook.com");
    assert.equal(init?.redirect, "error");
    return Response.json(
      u.pathname.includes("act_")
        ? { id: "act_33333", business: { id: "22222" } }
        : {
            id: "11111",
            name: "Synthetic brand dataset",
            owner_business: { id: "22222" },
          },
    );
  };
  assert.equal(
    (
      await verifyDestination(
        {
          datasetId: "11111",
          businessId: "22222",
          adAccountId: "33333",
          token: "synthetic-token",
        },
        mock,
      )
    ).label,
    "Synthetic brand dataset",
  );
  assert.equal(urls.length, 2);
  await assert.rejects(
    verifyDestination(
      {
        datasetId: "11111",
        businessId: "99999",
        adAccountId: "33333",
        token: "synthetic-token",
      },
      mock,
    ),
    /owner_mismatch/,
  );
});
test("CAPI makes one POST, retains separate test mode and does not equate receipt with matching", async () => {
  let calls = 0;
  const event = buildFeedbackEvent("company", actual),
    mock: typeof fetch = async (input, init) => {
      calls++;
      assert.equal(
        String(input),
        "https://graph.facebook.com/v27.0/11111/events",
      );
      const p = JSON.parse(String(init?.body));
      assert.equal(p.test_event_code, "TEST_SYNTHETIC");
      assert.equal(p.data[0].event_id, actual.eventId);
      return Response.json({
        events_received: 1,
        fbtrace_id: "synthetic_trace",
      });
    };
  const r = await postFeedback(
    "11111",
    "synthetic-token",
    event,
    "TEST_SYNTHETIC",
    mock,
  );
  assert.equal(r.state, "accepted");
  assert.equal(calls, 1);
  assert.deepEqual(r.receipt, {
    eventsReceived: 1,
    traceId: "synthetic_trace",
  });
  calls = 0;
  const timeout: typeof fetch = async () => {
    calls++;
    throw Error("timeout");
  };
  assert.equal(
    (await postFeedback("11111", "synthetic-token", event, null, timeout))
      .state,
    "unknown",
  );
  assert.equal(calls, 1);
});
