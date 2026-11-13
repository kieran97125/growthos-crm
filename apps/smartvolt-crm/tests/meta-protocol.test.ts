import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { parseEvents, signatureValid } from "../src/lib/meta/protocol";
import { inspectPage, sendMetaText } from "../src/lib/meta/graph";
import {
  encryptCredentials,
  decryptCredentials,
} from "../src/lib/whatsapp/crypto";
const now = Date.now();
const envelope = (
  message: Record<string, unknown> = {
    mid: "mid.1",
    text: "想了解 CRM",
    referral: { ad_id: "99001" },
  },
) => ({
  object: "page",
  entry: [
    {
      id: "10001",
      messaging: [
        {
          sender: { id: "20001" },
          recipient: { id: "10001" },
          timestamp: now,
          message,
        },
      ],
    },
  ],
});
test("signed raw evidence rejects changed bytes, malformed signatures and wrong secrets", () => {
  const raw = Buffer.from(JSON.stringify(envelope()));
  const signature =
    "sha256=" +
    createHmac("sha256", "synthetic-app-secret").update(raw).digest("hex");
  assert.equal(signatureValid(raw, signature, "synthetic-app-secret"), true);
  assert.equal(
    signatureValid(
      Buffer.concat([raw, Buffer.from(" ")]),
      signature,
      "synthetic-app-secret",
    ),
    false,
  );
  assert.equal(signatureValid(raw, "sha256=zz", "synthetic-app-secret"), false);
  assert.equal(signatureValid(raw, signature, "other-secret"), false);
});
test("inbound and ad evidence retain identity; replay keys are stable; echoes never open a customer window", () => {
  const a = parseEvents(envelope(), now)[0],
    b = parseEvents(envelope(), now)[0];
  assert.equal(a.key, b.key);
  assert.equal(a.kind, "inbound");
  assert.deepEqual(a.referral, { ad_id: "99001" });
  const echo = {
    object: "page",
    entry: [
      {
        id: "10001",
        messaging: [
          {
            sender: { id: "10001" },
            recipient: { id: "20001" },
            timestamp: now,
            message: { mid: "echo.1", text: "已回覆", is_echo: true },
          },
        ],
      },
    ],
  };
  assert.equal(parseEvents(echo, now)[0].kind, "echo");
  assert.equal(parseEvents(echo, now)[0].peerId, "20001");
});
test("scope mismatch and future evidence fail closed; IG and unsupported attachments remain distinct", () => {
  const wrong = envelope();
  wrong.entry[0].messaging[0].recipient.id = "30001";
  assert.throws(() => parseEvents(wrong, now));
  const future = envelope();
  future.entry[0].messaging[0].timestamp = now + 600000;
  assert.throws(() => parseEvents(future, now));
  const ig = {
    ...envelope({
      mid: "ig1",
      attachments: [
        { type: "image", payload: { url: "https://invalid.test/photo" } },
      ],
    }),
    object: "instagram",
  };
  const event = parseEvents(ig, now)[0];
  assert.equal(event.channel, "instagram");
  assert.match(event.body, /附件/);
});
test("watermarks are preserved without inventing an individual read receipt", () => {
  const p = {
    object: "page",
    entry: [
      {
        id: "10001",
        messaging: [
          {
            sender: { id: "20001" },
            recipient: { id: "10001" },
            timestamp: now,
            read: { watermark: now },
          },
        ],
      },
    ],
  };
  const e = parseEvents(p, now)[0];
  assert.equal(e.kind, "read");
  assert.equal(e.mid, null);
  assert.deepEqual(e.raw.read, { watermark: now });
});
test("Meta credential scope cannot be opened by the WhatsApp namespace or another tenant", () => {
  const key = randomBytes(32),
    value = encryptCredentials(
      { token: "synthetic" },
      key,
      "meta:company-a",
      "connection-a",
    );
  assert.equal(
    decryptCredentials(value, key, "meta:company-a", "connection-a").token,
    "synthetic",
  );
  assert.throws(() =>
    decryptCredentials(value, key, "company-a", "connection-a"),
  );
  assert.throws(() =>
    decryptCredentials(value, key, "meta:company-b", "connection-a"),
  );
});
const fake = (responses: unknown[]) => {
  let calls = 0;
  return {
    fetcher: async (input: URL | string | Request, init?: RequestInit) => {
      assert.equal(new URL(String(input)).origin, "https://graph.facebook.com");
      assert.equal(init?.redirect, "error");
      return new Response(JSON.stringify(responses[calls++]));
    },
    get calls() {
      return calls;
    },
  };
};
test("Page token is checked against the platform App, required permissions and actual Page identity", async () => {
  const f = fake([
    {
      data: {
        is_valid: true,
        app_id: "10001",
        type: "PAGE",
        scopes: ["pages_messaging", "pages_manage_metadata"],
      },
    },
    { id: "20001", name: "Synthetic Page" },
  ]);
  const result = await inspectPage(
    { appId: "10001", appSecret: "synthetic" },
    "20001",
    "messenger",
    "synthetic-page-token",
    f.fetcher as typeof fetch,
  );
  assert.equal(result.accountId, "20001");
  assert.equal(f.calls, 2);
  const wrong = fake([
    {
      data: {
        is_valid: true,
        app_id: "99999",
        type: "PAGE",
        scopes: ["pages_messaging", "pages_manage_metadata"],
      },
    },
  ]);
  await assert.rejects(
    () =>
      inspectPage(
        { appId: "10001", appSecret: "synthetic" },
        "20001",
        "messenger",
        "synthetic-page-token",
        wrong.fetcher as typeof fetch,
      ),
    /token_app_mismatch/,
  );
});
test("manual send distinguishes provider acceptance, rejection and ambiguous transport with no retry", async () => {
  const f = fake([{ recipient_id: "20001", message_id: "mid.accepted" }]);
  assert.equal(
    (
      await sendMetaText(
        "10001",
        "messenger",
        "20001",
        "你好",
        "synthetic",
        f.fetcher as typeof fetch,
      )
    ).state,
    "accepted",
  );
  let calls = 0;
  const timeout = async () => {
    calls++;
    throw new Error("network contains no safe detail");
  };
  const result = await sendMetaText(
    "10001",
    "messenger",
    "20001",
    "你好",
    "synthetic",
    timeout as typeof fetch,
  );
  assert.equal(result.state, "uncertain");
  assert.equal(calls, 1);
  const denied = async () =>
    new Response(
      JSON.stringify({
        error: { code: 10, message: "untrusted secret-like text" },
      }),
      { status: 403 },
    );
  const failure = await sendMetaText(
    "10001",
    "messenger",
    "20001",
    "你好",
    "synthetic",
    denied as typeof fetch,
  );
  assert.equal(failure.state, "failed");
  assert.equal(failure.code, "permission_missing");
});
test("standalone ad referrals are evidence, not customer messages or a new service window", () => {
  const p = {
    object: "page",
    entry: [
      {
        id: "10001",
        messaging: [
          {
            sender: { id: "20001" },
            recipient: { id: "10001" },
            timestamp: now,
            referral: { source: "ADS", ad_id: "99001" },
          },
        ],
      },
    ],
  };
  const e = parseEvents(p, now)[0];
  assert.equal(e.kind, "referral");
  assert.equal(e.mid, null);
  assert.equal(e.body, "");
  assert.equal(e.referral?.ad_id, "99001");
});
