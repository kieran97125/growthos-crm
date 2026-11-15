import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inspectAudio,
  mediaUrl,
  downloadProviderAudio,
  boundedAudio,
  VoiceMediaError,
  whatsappAudioMetadata,
} from "../src/lib/voice/audio";
import {
  extractVoiceNeeds,
  voiceLanguage,
  voiceCommand,
} from "../src/lib/voice/model";
import { DEFAULT_GRAPH_VERSION } from "../src/lib/whatsapp/graph";
function wav(seconds: number) {
  const rate = 8000,
    bytes = Buffer.alloc(44 + rate * seconds * 2);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
test("audio is sniffed and duration validated from bytes, not filename or browser metadata", async () => {
  const m = await inspectAudio(wav(2));
  assert.equal(m.mimeType, "audio/wav");
  assert.equal(m.durationSeconds, 2);
  assert.match(m.contentHash, /^[a-f0-9]{64}$/);
  await assert.rejects(
    () => inspectAudio(new TextEncoder().encode("<html>not audio</html>")),
    /audio_format/,
  );
  await assert.rejects(
    () => inspectAudio(new Uint8Array(4 * 1024 * 1024 + 1)),
    /audio_too_large/,
  );
  // Short enough bytes, malicious duration in authoritative WAV metadata.
  const long = wav(1);
  long.writeUInt32LE(1, 24);
  long.writeUInt32LE(2, 28);
  await assert.rejects(() => inspectAudio(long), /audio_too_long/);
});
test("only exact HTTPS provider CDN origins can be fetched, with no redirect or token leak", async () => {
  for (const url of [
    "http://lookaside.fbsbx.com/a",
    "https://lookaside.fbsbx.com.evil.example/a",
    "https://evilfbcdn.net/a",
    "https://127.0.0.1/a",
    "https://u:p@lookaside.fbsbx.com/a",
    "https://lookaside.fbsbx.com:8443/a",
    "https://lookaside.fbsbx.com/a#x",
  ])
    assert.throws(() => mediaUrl(url), /audio_url_invalid/);
  assert.equal(mediaUrl("https://a.b.fbcdn.net/a").hostname, "a.b.fbcdn.net");
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(wav(1));
  }) as typeof fetch;
  await downloadProviderAudio(
    "https://lookaside.fbsbx.com/a",
    "secret",
    fetcher,
  );
  assert.equal(calls[0].init?.redirect, "error");
  assert.deepEqual(calls[0].init?.headers, { Authorization: "Bearer secret" });
  await downloadProviderAudio("https://a.fbcdn.net/a", undefined, fetcher);
  assert.deepEqual(calls[1].init?.headers, {});
  await assert.rejects(() =>
    downloadProviderAudio("https://evil.example/a", "secret", fetcher),
  );
  assert.equal(calls.length, 2);
});
test("chunked audio and declared length enforce the same bounded limit", async () => {
  await assert.rejects(
    () =>
      boundedAudio(
        new Response("fake", { headers: { "content-length": "9000000" } }),
      ),
    /audio_too_large/,
  );
  await assert.rejects(
    () =>
      boundedAudio(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(5));
              c.enqueue(new Uint8Array(5));
              c.close();
            },
          }),
        ),
        8,
      ),
    /audio_too_large/,
  );
  await assert.rejects(
    () => boundedAudio(new Response(null, { status: 404 })),
    (e) => e instanceof VoiceMediaError && e.code === "audio_expired",
  );
});
test("WhatsApp voice metadata uses the configured Graph version and rejects unsafe versions before fetching", async () => {
  const originalVersion = process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION;
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Response.json({
      id: "123456789",
      url: "https://lookaside.fbsbx.com/audio",
    });
  }) as typeof fetch;
  try {
    delete process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION;
    await whatsappAudioMetadata("123456789", "synthetic-token", fetcher);
    assert.equal(
      calls[0].url,
      `https://graph.facebook.com/${DEFAULT_GRAPH_VERSION}/123456789`,
    );
    process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION = "v28.1";
    await whatsappAudioMetadata("123456789", "synthetic-token", fetcher);
    assert.equal(calls[1].url, "https://graph.facebook.com/v28.1/123456789");
    assert.equal(calls[1].init?.redirect, "error");
    assert.equal(calls[1].init?.cache, "no-store");
    assert.deepEqual(calls[1].init?.headers, {
      Authorization: "Bearer synthetic-token",
    });
    for (const version of [
      "v28.1/evil",
      "https://evil.example",
      "v0.0",
      "v28.1?token=x",
      "v28.1\n",
    ]) {
      process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION = version;
      await assert.rejects(
        () => whatsappAudioMetadata("123456789", "synthetic-token", fetcher),
        (e) => e instanceof VoiceMediaError && e.code === "audio_unavailable",
      );
    }
    assert.equal(calls.length, 2);
  } finally {
    if (originalVersion === undefined)
      delete process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION;
    else process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION = originalVersion;
  }
});
test("literal voice needs and dates retain quotation and uncertainty; Welsh is never Cantonese", () => {
  const text = "我想預約星期六下晝。Can I ask the price? 未確認預約。";
  const parts = extractVoiceNeeds(text);
  assert.ok(parts.some((x) => x.kind === "date"));
  assert.ok(parts.every((x) => x.text === x.quote && text.includes(x.quote)));
  assert.ok(!parts.some((x) => x.text === "已確認預約"));
  assert.equal(voiceLanguage("yue", "我想預約"), "cantonese");
  assert.equal(voiceLanguage("cy", "Bore da"), "other");
  assert.notEqual(voiceLanguage("cy", "你好"), "cantonese");
  assert.equal(voiceLanguage(undefined, text), "mixed");
});
test("common English questions and Simplified needs remain exact requests rather than inferred business facts", () => {
  const requests = [
    "How much are your packages",
    "Can I come on Saturday",
    "Could you tell me about the trial",
    "Is there any availability tomorrow",
    "Do you offer trials",
    "I'd like to ask about memberships",
    "I’m looking for a trial",
    "我想预约星期六，查询一下价格和收费",
    "请问有咩服务，可以预订吗",
    "I don't want to book yet",
  ];
  for (const text of requests) {
    const needs = extractVoiceNeeds(text).filter(
      (part) => part.kind === "need",
    );
    assert.deepEqual(needs, [{ kind: "need", text, quote: text }]);
  }
  assert.deepEqual(extractVoiceNeeds("The cat is asleep"), []);
  assert.deepEqual(extractVoiceNeeds("這只是一段普通描述"), []);
});
test("browser voice commands cannot inject media URLs, transcript evidence or inferred confirmations", () => {
  const base = {
    type: "transcribe",
    requestId: "11111111-1111-4111-8111-111111111111",
    brandId: "main",
    source: "whatsapp",
    sourceId: "22222222-2222-4222-8222-222222222222",
    messageId: "33333333-3333-4333-8333-333333333333",
  };
  assert.ok(voiceCommand.safeParse(base).success);
  for (const field of [
    "url",
    "token",
    "durationSeconds",
    "text",
    "extractions",
  ])
    assert.equal(
      voiceCommand.safeParse({ ...base, [field]: "forged" }).success,
      false,
    );
});
