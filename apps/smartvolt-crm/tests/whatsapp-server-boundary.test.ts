import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchClaim } from "../src/lib/whatsapp/dispatch";
import {
  boundedBytes,
  boundedJson,
  commandInput,
  connectionInput,
  sendInput,
} from "../src/lib/whatsapp/http";

test("a replayed SQL claim returns persisted outcome without invoking Meta or finishing twice", async () => {
  let network = 0,
    writes = 0;
  const persisted = { id: "message", state: "unknown" };
  const result = await dispatchClaim({
    claim: { dispatch: false, message: persisted },
    send: async () => {
      network++;
      return { ok: true, providerId: "wamid.mock", accepted: true };
    },
    finish: async () => {
      writes++;
      return persisted;
    },
  });
  assert.equal(network, 0);
  assert.equal(writes, 0);
  assert.equal(result.message, persisted);
  assert.equal(result.dispatched, false);
});

test("a lost provider response persists ambiguity exactly once and never retries", async () => {
  let network = 0,
    writes = 0;
  const result = await dispatchClaim({
    claim: { dispatch: true, message: { state: "dispatching" } },
    send: async () => {
      network++;
      throw new Error("provider body must never escape");
    },
    finish: async (outcome) => {
      writes++;
      assert.deepEqual(outcome, {
        ok: false,
        disposition: "ambiguous",
        code: "delivery_unknown",
      });
      return { state: "unknown" };
    },
  });
  assert.equal(network, 1);
  assert.equal(writes, 1);
  assert.equal(result.message.state, "unknown");
  assert.equal(result.ambiguous, true);
});

test("provider acceptance remains acceptance and finish failure cannot trigger another send", async () => {
  let network = 0;
  await assert.rejects(
    dispatchClaim({
      claim: { dispatch: true, message: { state: "dispatching" } },
      send: async () => {
        network++;
        return { ok: true, providerId: "wamid.mock", accepted: true };
      },
      finish: async (outcome) => {
        assert.equal(outcome.ok, true);
        throw new Error("database unavailable after acceptance");
      },
    }),
    /database unavailable/,
  );
  assert.equal(network, 1);
});

test("body size is enforced on actual bytes even with an absent or misleading length", async () => {
  for (const headers of [
    new Headers(),
    new Headers({ "content-length": "1" }),
  ]) {
    const request = new Request("https://crm.test", {
      method: "POST",
      headers,
      body: "🙂".repeat(10),
    });
    await assert.rejects(
      boundedBytes(request, 20),
      (error) =>
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 413,
    );
  }
  const ok = new Request("https://crm.test", { method: "POST", body: "hello" });
  assert.equal((await boundedBytes(ok, 5)).toString(), "hello");
});

test("mutation JSON rejects wrong media type and malformed payload without exposing it", async () => {
  await assert.rejects(
    boundedJson(
      new Request("https://crm.test", { method: "POST", body: "secret" }),
    ),
    /JSON/,
  );
  await assert.rejects(
    boundedJson(
      new Request("https://crm.test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{secret",
      }),
    ),
    (error) => {
      assert.equal(String(error).includes("{secret"), false);
      return true;
    },
  );
});

test("a full 4096-character astral reply fits the bounded JSON request with its metadata", async () => {
  const intent = {
    clientId: "d1bfd800-4e9b-4b27-8c92-160c0161358b",
    revision: 3,
    replyTo: "ed7ab656-3445-43d8-b94a-0c83eb7376cd",
    body: "🙂".repeat(4096),
  };
  const encoded = JSON.stringify(intent);
  assert.ok(Buffer.byteLength(encoded) > 16 * 1024);
  const request = new Request("https://crm.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: encoded,
  });
  assert.deepEqual(sendInput.parse(await boundedJson(request)), intent);
  assert.equal(
    sendInput.safeParse({ ...intent, body: "🙂".repeat(4097) }).success,
    false,
  );
});

test("commands accept local UUIDs only and callers cannot supply a recipient or raw credential envelope", () => {
  const base = {
    clientId: "d1bfd800-4e9b-4b27-8c92-160c0161358b",
    revision: 3,
  };
  assert.equal(
    sendInput.safeParse({ ...base, body: "你好", to: "85212345678" }).success,
    false,
  );
  assert.equal(
    sendInput.safeParse({ ...base, body: " ", replyTo: "wamid.private" })
      .success,
    false,
  );
  assert.equal(
    commandInput.safeParse({ ...base, kind: "resolve", body: "hidden note" })
      .success,
    false,
  );
  assert.equal(
    commandInput.safeParse({ ...base, kind: "note" }).success,
    false,
  );
  assert.equal(
    commandInput.safeParse({ ...base, kind: "note", body: "客戶查詢" }).success,
    true,
  );
  assert.equal(
    connectionInput.safeParse({
      brandId: "brand",
      appId: "1",
      accountId: "2",
      phoneNumberId: "3",
      appSecret: "a".repeat(32),
      accessToken: "b".repeat(32),
      encryptedCredentials: {},
    }).success,
    false,
  );
});
