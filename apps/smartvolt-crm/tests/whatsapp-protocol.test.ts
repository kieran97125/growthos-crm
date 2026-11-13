import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  decryptCredentials,
  encryptCredentials,
  keyFingerprint,
  readMasterKey,
} from "../src/lib/whatsapp/crypto";
import {
  buildTextPayload,
  GRAPH_TIMEOUT_MS,
  inspectPhoneNumber,
  sendText,
  type SendTextInput,
} from "../src/lib/whatsapp/graph";
import {
  hashVerifyToken,
  MAX_WEBHOOK_BYTES,
  parseWebhook,
  verifyAndParseWebhook,
  verifyChallengeToken,
  verifyWebhookChallenge,
  verifyWebhookSignature,
} from "../src/lib/whatsapp/protocol";
import { WaProtocolError, type WaIdentity } from "../src/lib/whatsapp/types";

// Synthetic protocol fixtures only; none are production company/customer identities.
const phone: WaIdentity = {
  kind: "phone",
  id: "16505550100",
  phone: "16505550100",
  bsuid: null,
  parentBsuid: null,
};
const bsuid: WaIdentity = {
  kind: "bsuid",
  id: "US.synthetic-user",
  phone: null,
  bsuid: "US.synthetic-user",
  parentBsuid: null,
};
const sendId = "018e6235-78ac-7a40-9234-0123456789ab";
const secret = "synthetic-app-secret";
const input: SendTextInput = {
  phoneNumberId: "101010101",
  accessToken: "synthetic-test-token",
  to: phone,
  text: "測試手動回覆",
};
const timestamp = "1794384000";
const incoming = (extra: Record<string, unknown> = {}) => ({
  id: "wamid.synthetic-in",
  from: phone.id,
  timestamp,
  type: "text",
  text: { body: "想了解服務" },
  ...extra,
});
const envelope = (
  messages: unknown[] = [],
  statuses: unknown[] = [],
  extra: Record<string, unknown> = {},
) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "202020202",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: input.phoneNumberId },
            messages,
            statuses,
            ...extra,
          },
        },
      ],
    },
  ],
});
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const signature = (value: Uint8Array) =>
  `sha256=${createHmac("sha256", secret).update(value).digest("hex")}`;
const errorCode = (code: string) => (error: unknown) =>
  error instanceof WaProtocolError &&
  error.code === code &&
  error.message === code;
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("signature validates exact raw bytes before JSON parsing", () => {
  const bytes = json(envelope([incoming()]));
  assert.equal(verifyWebhookSignature(bytes, signature(bytes), secret), true);
  assert.equal(
    verifyWebhookSignature(
      Buffer.concat([bytes, Buffer.from(" ")]),
      signature(bytes),
      secret,
    ),
    false,
  );
  assert.equal(verifyWebhookSignature(bytes, null, secret), false);
  assert.equal(verifyWebhookSignature(bytes, "sha256=bad", secret), false);
  assert.equal(
    verifyWebhookSignature(bytes, signature(bytes), "another-secret"),
    false,
  );
  assert.equal(
    verifyWebhookSignature(
      Buffer.alloc(MAX_WEBHOOK_BYTES + 1),
      signature(bytes),
      secret,
    ),
    false,
  );
  assert.throws(
    () => verifyAndParseWebhook("not-json", null, secret),
    errorCode("invalid_webhook_signature"),
  );
  assert.equal(
    verifyAndParseWebhook(bytes, signature(bytes), secret).events.length,
    1,
  );
});

test("GET verification returns the exact challenge for matching hashed token only", () => {
  const hash = hashVerifyToken("synthetic-verify-token");
  assert.equal(hash.length, 64);
  assert.equal(verifyChallengeToken("synthetic-verify-token", hash), true);
  assert.equal(verifyChallengeToken("wrong", hash), false);
  assert.equal(
    verifyChallengeToken("synthetic-verify-token", "invalid"),
    false,
  );
  const params = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": "synthetic-verify-token",
    "hub.challenge": "00123",
  });
  assert.equal(verifyWebhookChallenge(params, hash), "00123");
  params.set("hub.mode", "unsubscribe");
  assert.equal(verifyWebhookChallenge(params, hash), null);
  assert.throws(
    () => hashVerifyToken("x\ny"),
    errorCode("verify_token_invalid"),
  );
});

test("inbound normalization preserves private CTWA evidence, quote and original body", () => {
  const referral = {
    source_type: "ad",
    source_id: "synthetic-ad",
    ctwa_clid: "synthetic-click",
    headline: "Private ad evidence",
  };
  const message = incoming({
    referral,
    context: { id: "wamid.synthetic-quote" },
  });
  const batch = parseWebhook(
    json(
      envelope([message], [], {
        contacts: [{ wa_id: phone.id, profile: { name: "測試客戶" } }],
      }),
    ),
  );
  assert.equal(batch.events.length, 1);
  const event = batch.events[0];
  assert.equal(event.kind, "message");
  if (event.kind !== "message") return;
  assert.deepEqual(event.identity, phone);
  assert.equal(event.profileName, "測試客戶");
  assert.equal(event.providerAt, Number(timestamp) * 1000);
  assert.equal(event.accountId, "202020202");
  assert.equal(event.phoneNumberId, input.phoneNumberId);
  assert.equal(event.body, "想了解服務");
  assert.equal(event.replyToProviderId, "wamid.synthetic-quote");
  assert.deepEqual(event.referral, referral);
  assert.deepEqual(event.raw, message);
  assert.equal("consent" in event, false);
});

test("BSUID is stable identity even with phone, and BSUID-only users need no phone", () => {
  for (const from of [phone.id, undefined]) {
    const batch = parseWebhook(
      json(
        envelope(
          [
            incoming({
              from,
              from_user_id: bsuid.id,
              from_parent_user_id: "US.synthetic-parent",
            }),
          ],
          [],
          {
            contacts: [{ user_id: bsuid.id, profile: { name: "BSUID 測試" } }],
          },
        ),
      ),
    );
    const event = batch.events[0];
    assert.equal(event.kind, "message");
    if (event.kind !== "message") continue;
    assert.equal(event.identity.id, bsuid.id);
    assert.equal(event.identity.kind, "bsuid");
    assert.equal(event.identity.phone, from ?? null);
    assert.equal(event.identity.parentBsuid, "US.synthetic-parent");
    assert.equal(event.profileName, "BSUID 測試");
  }
  const parent = parseWebhook(
    json(
      envelope([
        incoming({
          from: undefined,
          from_parent_user_id: "US.synthetic-parent",
        }),
      ]),
    ),
  ).events[0];
  assert.equal(
    parent.kind === "message" && parent.identity.id,
    "US.synthetic-parent",
  );
});

test("media and unsupported messages remain visible as placeholders without downloading media", () => {
  const messages = [
    incoming({
      id: "wamid.image",
      type: "image",
      text: undefined,
      image: { id: "private-media-id", caption: "客戶附註" },
    }),
    incoming({
      id: "wamid.unknown",
      type: "unknown_future_type",
      text: undefined,
    }),
    incoming({ id: "wamid.prototype-name", type: "toString", text: undefined }),
  ];
  const events = parseWebhook(json(envelope(messages))).events;
  assert.equal(
    events[0].kind === "message" && events[0].body,
    "［圖片訊息］ 客戶附註",
  );
  assert.equal(
    events[1].kind === "message" && events[1].body,
    "［其他 WhatsApp 訊息］",
  );
  assert.equal(
    events[2].kind === "message" && events[2].body,
    "［其他 WhatsApp 訊息］",
  );
});

test("read/played and failed status without recipient retain provider evidence and send UUID", () => {
  const statuses = ["read", "played", "failed"].map((status) => ({
    id: `wamid.${status}`,
    timestamp,
    status,
    biz_opaque_callback_data: sendId,
    ...(status === "failed"
      ? { errors: [{ code: 131047, message: "private provider diagnostic" }] }
      : { recipient_user_id: bsuid.id }),
  }));
  const events = parseWebhook(json(envelope([], statuses))).events;
  assert.equal(events.length, 3);
  for (const event of events) {
    assert.equal(event.kind, "status");
    if (event.kind !== "status") continue;
    assert.equal(event.opaqueCallbackData, sendId);
    assert.equal(
      event.recipient?.id ?? null,
      event.status === "failed" ? null : bsuid.id,
    );
    assert.equal(event.errorCode, event.status === "failed" ? 131047 : null);
    assert.equal("message" in event, false);
  }
});

test("duplicates pass through for transactional database dedupe; malformed records produce safe issues", () => {
  const batch = parseWebhook(
    json(
      envelope([
        incoming(),
        incoming(),
        { id: "private-customer-data", timestamp: "NaN" },
      ]),
    ),
  );
  assert.equal(batch.events.length, 2);
  assert.deepEqual(batch.events[0], batch.events[1]);
  assert.deepEqual(batch.issues, [
    { code: "invalid_incoming_message", index: 1 },
  ]);
  assert.equal(
    JSON.stringify(batch.issues).includes("private-customer-data"),
    false,
  );
});

test("webhook enforces byte, record and change bounds even for invalid records", () => {
  assert.throws(
    () => parseWebhook(Buffer.alloc(MAX_WEBHOOK_BYTES + 1)),
    errorCode("webhook_too_large"),
  );
  assert.throws(
    () => parseWebhook(Buffer.from([0xff])),
    errorCode("invalid_webhook_json"),
  );
  assert.throws(() => parseWebhook("{}"), errorCode("invalid_webhook"));
  assert.throws(
    () => parseWebhook(json(envelope(Array(1001).fill(null)))),
    errorCode("too_many_webhook_updates"),
  );
  const split = envelope(Array(600).fill(null));
  split.entry[0].changes.push({
    ...split.entry[0].changes[0],
    value: {
      ...split.entry[0].changes[0].value,
      messages: Array(600).fill(null),
    },
  });
  assert.throws(
    () => parseWebhook(json(split)),
    errorCode("too_many_webhook_updates"),
  );
  const changes = envelope();
  changes.entry[0].changes = Array(1001).fill(changes.entry[0].changes[0]);
  assert.throws(
    () => parseWebhook(json(changes)),
    errorCode("too_many_webhook_updates"),
  );
  assert.deepEqual(parseWebhook(json({ object: "unrelated", entry: [] })), {
    events: [],
    ignored: 1,
    issues: [],
  });
});

test("AES-GCM encrypts with random nonce and company/connection authenticated scope", () => {
  const key = Buffer.alloc(32, 17);
  const credentials = {
    appSecret: "synthetic-only-secret",
    accessToken: "synthetic-only-token",
  };
  const first = encryptCredentials(
    credentials,
    key,
    "company-a",
    "connection-a",
  );
  const second = encryptCredentials(
    credentials,
    key,
    "company-a",
    "connection-a",
  );
  assert.equal(first.version, 1);
  assert.equal(first.keyId, keyFingerprint(key));
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(JSON.stringify(first).includes(credentials.appSecret), false);
  assert.deepEqual(
    decryptCredentials(first, key, "company-a", "connection-a"),
    credentials,
  );
  assert.throws(
    () => decryptCredentials(first, key, "company-b", "connection-a"),
    errorCode("credential_decryption_failed"),
  );
  assert.throws(
    () => decryptCredentials(first, key, "company-a", "connection-b"),
    errorCode("credential_decryption_failed"),
  );
  assert.throws(
    () =>
      decryptCredentials(
        first,
        Buffer.alloc(32, 18),
        "company-a",
        "connection-a",
      ),
    errorCode("credential_key_mismatch"),
  );
  assert.throws(
    () =>
      decryptCredentials(
        { ...first, tag: Buffer.alloc(16).toString("base64url") },
        key,
        "company-a",
        "connection-a",
      ),
    errorCode("credential_decryption_failed"),
  );
});

test("encryption rejects invalid base64 keys, malformed envelopes and unbounded plaintext safely", () => {
  const key = Buffer.alloc(32, 17);
  assert.deepEqual(readMasterKey(key.toString("base64")), key);
  for (const candidate of [
    "",
    "not-a-key",
    Buffer.alloc(31).toString("base64"),
    `${key.toString("base64")}extra`,
  ])
    assert.throws(
      () => readMasterKey(candidate),
      (error: unknown) => error instanceof WaProtocolError,
    );
  assert.throws(
    () =>
      encryptCredentials(
        { value: "x".repeat(65_536) },
        key,
        "company-a",
        "connection-a",
      ),
    errorCode("credentials_invalid"),
  );
  assert.throws(
    () => decryptCredentials({}, key, "company-a", "connection-a"),
    errorCode("credential_envelope_invalid"),
  );
  assert.throws(
    () => encryptCredentials({}, key, "company\nprivate", "connection-a"),
    errorCode("credential_scope_invalid"),
  );
});

test("text payload keeps phone and BSUID routing mutually exclusive and carries reconciliation UUID", () => {
  const body = buildTextPayload({
    ...input,
    opaqueCallbackData: sendId,
    messagingAccountId: "303030303",
    replyToProviderId: "wamid.synthetic-quote",
  });
  assert.equal(body?.to, phone.id);
  assert.equal(body?.recipient, undefined);
  assert.equal(body?.biz_opaque_callback_data, sendId);
  assert.equal(body?.messaging_account_id, "303030303");
  assert.deepEqual(body?.context, { message_id: "wamid.synthetic-quote" });
  const user = buildTextPayload({
    ...input,
    to: { ...bsuid, phone: phone.id },
  });
  assert.equal(user?.recipient, bsuid.id);
  assert.equal(user?.to, undefined);
  assert.equal(JSON.stringify(body).includes(input.accessToken), false);
  assert.ok(buildTextPayload({ ...input, text: "💬".repeat(4096) }));
});

test("invalid send requests are rejected before fetch", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    throw new Error("must not fetch");
  };
  const invalid: SendTextInput[] = [
    { ...input, text: " \n " },
    { ...input, text: "x".repeat(4097) },
    { ...input, text: "\ud800" },
    { ...input, phoneNumberId: "https://untrusted.example" },
    { ...input, version: "v27.0/evil" },
    { ...input, accessToken: "token\nprivate" },
    { ...input, opaqueCallbackData: "customer-private-data" },
    { ...input, to: { ...phone, id: "US.not-a-phone" } },
    { ...input, to: { ...phone, phone: "16505550101" } },
  ];
  for (const item of invalid)
    assert.deepEqual(await sendText(item, fetchImpl), {
      ok: false,
      code: "invalid_request",
      disposition: "definitive",
    });
  assert.equal(calls, 0);
});

test("send uses fixed HTTPS host, explicit timeout and one attempt; accepted never means delivered", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(
      url,
      `https://graph.facebook.com/v27.0/${input.phoneNumberId}/messages`,
    );
    assert.equal(options?.method, "POST");
    assert.equal(options?.redirect, "error");
    assert.equal(options?.cache, "no-store");
    assert.ok(options?.signal instanceof AbortSignal);
    assert.equal(
      new Headers(options.headers).get("Authorization"),
      `Bearer ${input.accessToken}`,
    );
    assert.equal(String(url).includes(input.accessToken), false);
    assert.equal(String(options.body).includes(input.accessToken), false);
    return reply({
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.synthetic-out" }],
    });
  };
  assert.deepEqual(await sendText(input, fetchImpl), {
    ok: true,
    providerId: "wamid.synthetic-out",
    accepted: true,
  });
  assert.equal(calls, 1);
  assert.equal(GRAPH_TIMEOUT_MS, 15_000);
});

test("provider rejections expose safe category/code only, never raw diagnostics or tokens", async () => {
  const cases: [number, number, string][] = [
    [401, 190, "provider_auth"],
    [400, 131047, "window_closed"],
    [400, 131026, "invalid_recipient"],
    [429, 130429, "rate_limited"],
    [400, 100, "provider_rejected"],
  ];
  for (const [status, code, expected] of cases) {
    const result = await sendText(input, async () =>
      reply(
        {
          error: {
            code,
            message: `${input.accessToken} private provider message`,
            error_data: { details: "private customer" },
          },
        },
        status,
      ),
    );
    assert.deepEqual(result, {
      ok: false,
      code: expected,
      disposition: "definitive",
      httpStatus: status,
      providerCode: code,
    });
    assert.equal(JSON.stringify(result).includes(input.accessToken), false);
    assert.equal(JSON.stringify(result).includes("private"), false);
  }
});

test("timeouts, transport failures, 5xx and unconfirmed success remain ambiguous without retry", async () => {
  const responses: (() => Response)[] = [
    () => reply({ error: { code: 2, message: "private" } }, 503),
    () => reply({}),
    () => new Response("not-json"),
    () => new Response("x".repeat(65_537)),
    () =>
      reply({ messages: [{ id: "wamid.ambiguous" }], error: { code: 100 } }),
  ];
  for (const response of responses) {
    let calls = 0;
    const result = await sendText(input, async () => {
      calls++;
      return response();
    });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.disposition, "ambiguous");
    assert.equal(calls, 1);
  }
  const transport = await sendText(input, async () => {
    throw new Error(`private ${input.accessToken}`);
  });
  assert.deepEqual(transport, {
    ok: false,
    code: "delivery_unknown",
    disposition: "ambiguous",
  });
  const timeout = await sendText(
    input,
    async (_url, options) =>
      new Promise((_resolve, reject) =>
        options?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        ),
      ),
    1,
  );
  assert.deepEqual(timeout, {
    ok: false,
    code: "delivery_unknown",
    disposition: "ambiguous",
  });
});

test("phone inspection is read-only, validates exact phone id and supports explicit Graph version", async () => {
  const result = await inspectPhoneNumber(
    { ...input, version: "v28.0" },
    async (url, options) => {
      assert.equal(
        url,
        `https://graph.facebook.com/v28.0/${input.phoneNumberId}?fields=id,display_phone_number,verified_name`,
      );
      assert.equal(options?.method, "GET");
      assert.equal(options?.body, undefined);
      return reply({
        id: input.phoneNumberId,
        display_phone_number: "+1 650 555 0100",
        verified_name: "Synthetic Test Company",
      });
    },
  );
  assert.deepEqual(result, {
    ok: true,
    phoneNumberId: input.phoneNumberId,
    displayPhoneNumber: "+1 650 555 0100",
    verifiedName: "Synthetic Test Company",
  });
  const mismatch = await inspectPhoneNumber(input, async () =>
    reply({ id: "99999999" }),
  );
  assert.equal(mismatch.ok, false);
  assert.equal(!mismatch.ok && mismatch.code, "provider_response_invalid");
});
