import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inspectMedia,
  boundedMedia,
  providerMediaUrl,
  fetchProviderMedia,
  whatsappMediaMetadata,
} from "../src/lib/media/bytes";
import {
  dispatchMedia,
  metaMediaPayload,
  whatsappMediaPayload,
} from "../src/lib/media/provider";
import {
  mediaCommand,
  safeFilename,
  supportedMedia,
} from "../src/lib/media/model";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6hcAAAAASUVORK5CYII=",
  "base64",
);
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const token = "synthetic-access-token";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const url =
  "https://synthetic.supabase.co/storage/v1/object/sign/private/synthetic?token=test";
test("attachments use maintained byte signatures, not browser MIME or extensions", async () => {
  assert.equal((await inspectMedia(png)).mimeType, "image/png");
  assert.equal((await inspectMedia(pdf)).kind, "document");
  for (const raw of [
    "<svg xmlns='http://www.w3.org/2000/svg'><script>x</script></svg>",
    "<html>fake.pdf</html>",
    "MZ executable",
  ]) {
    await assert.rejects(() => inspectMedia(Buffer.from(raw)), /media_format/);
  }
  await assert.rejects(
    () => inspectMedia(new Uint8Array(25 * 1024 * 1024 + 1)),
    /media_too_large/,
  );
  assert.match((await inspectMedia(pdf)).contentHash, /^[a-f0-9]{64}$/);
});
test("private metadata cannot choose an arbitrary provider origin or follow redirects", async () => {
  for (const raw of [
    "http://lookaside.fbsbx.com/a",
    "https://lookaside.fbsbx.com.evil.example/a",
    "https://fbcdn.net.evil.example/a",
    "https://127.0.0.1/a",
    "https://u:p@lookaside.fbsbx.com/a",
    "https://lookaside.fbsbx.com:8443/a",
    "https://lookaside.fbsbx.com/a#x",
  ])
    assert.throws(() => providerMediaUrl(raw), /media_url_invalid/);
  const calls: RequestInit[] = [];
  const fetcher = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init!);
    return new Response(png);
  }) as typeof fetch;
  await fetchProviderMedia("https://lookaside.fbsbx.com/a", token, fetcher);
  assert.equal(calls[0].redirect, "error");
  assert.deepEqual(calls[0].headers, { Authorization: "Bearer " + token });
  await fetchProviderMedia("https://a.fbcdn.net/a", undefined, fetcher);
  assert.deepEqual(calls[1].headers, {});
  await assert.rejects(() =>
    fetchProviderMedia("https://evil.example/a", token, fetcher),
  );
  assert.equal(calls.length, 2);
});
test("chunked and declared attachment downloads enforce identical byte limits", async () => {
  await assert.rejects(
    () =>
      boundedMedia(
        new Response("x", { headers: { "content-length": "26214401" } }),
      ),
    /media_too_large/,
  );
  await assert.rejects(
    () =>
      boundedMedia(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(4));
              c.enqueue(new Uint8Array(4));
              c.close();
            },
          }),
        ),
        7,
      ),
    /media_too_large/,
  );
  await assert.rejects(
    () => boundedMedia(new Response(null, { status: 410 })),
    /media_expired/,
  );
  await assert.rejects(() => boundedMedia(new Response("")), /media_empty/);
});
test("provider metadata keeps configured Graph version and bounds response identity", async () => {
  const calls: string[] = [];
  const fetcher = (async (u: RequestInfo | URL) => {
    calls.push(String(u));
    return Response.json({
      id: "12345",
      url: "https://lookaside.fbsbx.com/media",
      file_size: png.length,
    });
  }) as typeof fetch;
  await whatsappMediaMetadata("12345", token, "v28.1", fetcher);
  assert.equal(calls[0], "https://graph.facebook.com/v28.1/12345");
  await assert.rejects(() =>
    whatsappMediaMetadata("12345", token, "../../evil", fetcher),
  );
  assert.equal(calls.length, 1);
});
test("channel attachment capabilities do not silently accept unsupported image or office formats", () => {
  assert.equal(supportedMedia("image", "image/webp", "whatsapp"), false);
  assert.equal(supportedMedia("image", "image/png", "whatsapp"), true);
  assert.equal(
    supportedMedia("document", "application/pdf", "meta", "instagram"),
    true,
  );
  assert.equal(
    supportedMedia(
      "document",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "meta",
      "instagram",
    ),
    false,
  );
  assert.equal(
    supportedMedia(
      "document",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "meta",
      "messenger",
    ),
    true,
  );
});
test("safe filenames strip path, header controls and bidi spoofing without changing customer text", () => {
  assert.equal(safeFilename("../\u202eReceipt\r\n.pdf"), ".._Receipt__.pdf");
  assert.equal(safeFilename("療程說明.pdf"), "療程說明.pdf");
  assert.equal(safeFilename(""), "附件");
});
test("media command schemas never accept URLs, destinations, provider tokens or extra fields", () => {
  const scope = { brandId: "main", source: "whatsapp", sourceId: id };
  for (const extra of [
    { url: "https://evil.example" },
    { to: "85290000000" },
    { token: "secret" },
    { objectPath: "other/file" },
  ])
    assert.equal(
      mediaCommand.safeParse({
        ...scope,
        action: "prepare",
        messageId: id,
        index: 0,
        ...extra,
      }).success,
      false,
    );
  assert.equal(
    mediaCommand.safeParse({
      ...scope,
      action: "prepare",
      messageId: id,
      index: 10,
    }).success,
    false,
  );
});
test("WhatsApp media preserves exact phone/BSUID identity and provider receipt correlation", () => {
  const p = whatsappMediaPayload({
    phoneNumberId: "10001",
    token,
    to: {
      kind: "bsuid",
      id: "provider:scoped-id",
      phone: null,
      bsuid: "provider:scoped-id",
      parentBsuid: null,
    },
    kind: "document",
    url,
    filename: "資料.pdf",
    caption: "請參考",
    clientId: id,
    messagingAccountId: "20001",
  });
  assert.equal(p.recipient, "provider:scoped-id");
  assert.equal(p.to, undefined);
  assert.equal(p.type, "document");
  assert.equal(p.biz_opaque_callback_data, id);
  assert.deepEqual(p.document, {
    link: url,
    caption: "請參考",
    filename: "資料.pdf",
  });
  assert.equal("text" in p, false);
  assert.throws(() =>
    whatsappMediaPayload({
      phoneNumberId: "10001",
      token,
      to: {
        kind: "phone",
        id: "wrong",
        phone: "wrong",
        bsuid: null,
        parentBsuid: null,
      },
      kind: "image",
      url,
      filename: "x",
      caption: "",
      clientId: id,
    }),
  );
});
test("Meta attachment payload is channel-specific and does not send caption as an untracked second message", () => {
  assert.deepEqual(
    metaMediaPayload({
      accountId: "10001",
      peerId: "20001",
      channel: "messenger",
      kind: "document",
      url,
    }),
    {
      recipient: { id: "20001" },
      message: { attachment: { type: "file", payload: { url } } },
      messaging_type: "RESPONSE",
    },
  );
  const ig = metaMediaPayload({
    accountId: "10001",
    peerId: "20001",
    channel: "instagram",
    kind: "image",
    url,
  });
  assert.equal("messaging_type" in ig, false);
  assert.equal("text" in ig.message, false);
});
test("provider failures, lost responses and malformed acceptance remain truthfully separate", async () => {
  const base = {
    source: "meta" as const,
    accountId: "10001",
    peerId: "20001",
    token,
    payload: {},
  };
  const outcome = async (response: Response) =>
    dispatchMedia(base, (async () => response) as typeof fetch);
  assert.equal(
    (await outcome(Response.json({ message_id: "mid", recipient_id: "20001" })))
      .state,
    "accepted",
  );
  assert.equal(
    (await outcome(Response.json({ message_id: "mid", recipient_id: "99999" })))
      .state,
    "unknown",
  );
  assert.equal(
    (await outcome(Response.json({ error: { code: 190 } }, { status: 401 })))
      .state,
    "failed",
  );
  assert.equal(
    (await outcome(Response.json({ error: { code: 1 } }, { status: 500 })))
      .state,
    "unknown",
  );
  assert.equal(
    (await outcome(new Response("broken", { status: 200 }))).state,
    "unknown",
  );
  let calls = 0;
  const result = await dispatchMedia(base, (async () => {
    calls++;
    throw Error("network");
  }) as typeof fetch);
  assert.equal(result.state, "unknown");
  assert.equal(calls, 1);
});
