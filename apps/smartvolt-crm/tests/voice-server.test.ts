import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createHash, randomUUID } from "node:crypto";
const company = randomUUID(),
  actor = randomUUID(),
  assetId = randomUUID(),
  requestId = randomUUID(),
  thread = "synthetic-source";
type Fixture = {
  calls: string[];
  claim: Record<string, unknown>;
  downloadFailure: boolean;
  generatedFailure: boolean;
  bytes: Uint8Array;
  asset: Record<string, unknown>;
  transcript: Record<string, unknown> | null;
  pending: Record<string, unknown> | null;
  genCalls: number;
  access: Record<string, unknown>;
};
let f: Fixture, api: typeof import("../src/lib/voice/server");
const host = globalThis as typeof globalThis & { __voiceHarness?: Fixture };
class Query {
  filters: Record<string, unknown> = {};
  constructor(private table: string) {}
  select() {
    return this;
  }
  eq(k: string, v: unknown) {
    this.filters[k] = v;
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  maybeSingle() {
    return this;
  }
  in() {
    return this;
  }
  then(resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) {
    f.calls.push(this.table + ":" + JSON.stringify(this.filters));
    let data: unknown = [];
    if (this.table === "sv_voice_assets") data = [f.asset];
    if (this.table === "sv_voice_transcripts") data = f.transcript;
    if (this.table === "sv_voice_corrections") data = [];
    if (this.table === "sv_ai_settings") data = { enabled: true };
    if (this.table === "sv_ai_requests") data = f.pending;
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  }
}
function fixture() {
  const bytes = new Uint8Array([1, 2, 3]);
  f = {
    calls: [],
    claim: { dispatch: false, status: "running" },
    downloadFailure: false,
    generatedFailure: false,
    bytes,
    genCalls: 0,
    transcript: null,
    pending: null,
    asset: {
      id: assetId,
      brand_id: "main",
      source: "conversation",
      source_id: thread,
      message_id: assetId,
      origin: "staff_upload",
      object_path: company + "/" + assetId,
      content_hash: createHash("sha256").update(bytes).digest("hex"),
      mime_type: "audio/wav",
      audio_bytes: 3,
      duration_seconds: 1,
      created_at: new Date().toISOString(),
    },
    access: {},
  };
  const db = {
    from: (table: string) => new Query(table),
    storage: {
      from: () => ({
        download: async () => {
          f.calls.push("private-audio-download");
          return f.downloadFailure
            ? { data: null, error: { message: "unavailable" } }
            : { data: new Blob([new Uint8Array(f.bytes)]), error: null };
        },
      }),
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      f.calls.push(fn);
      if (fn === "sv_voice_claim") return { data: f.claim, error: null };
      if (fn === "sv_voice_finish") {
        if (!args.p_error)
          f.transcript = {
            id: requestId,
            asset_id: assetId,
            original_text: "想預約星期六",
            language: "cantonese",
            extractions: [],
            created_at: new Date().toISOString(),
          };
        return {
          data: {
            status: args.p_error ? "failed" : "completed",
            error_code: args.p_error,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };
  f.access = {
    company: { id: company },
    user: { id: actor },
    actor: { role: "owner" },
    scope: { brands: [{ id: "main" }] },
    db,
  };
  host.__voiceHarness = f;
}
before(async () => {
  const stubs: Record<string, string> = {
    "server-only": "export{};",
    "@/lib/saas/server":
      "export const loadCompany=async()=>globalThis.__voiceHarness.access;",
    "@/lib/ai/server": "export const aiModel=()=> 'synthetic/text';",
    "./generate":
      "export const transcriptionModel=()=> 'synthetic/audio';export const transcribeVoice=async()=>{const h=globalThis.__voiceHarness;h.genCalls++;if(h.generatedFailure)throw new Error('provider failed');return {text:'想預約星期六',language:'cantonese',extractions:[]}};",
    "./audio":
      "export class VoiceMediaError extends Error{};export const downloadProviderAudio=()=>{throw new Error('unexpected native fetch')};export const inspectAudio=()=>{throw new Error('unexpected upload')};export const mediaUrl=()=>{};export const whatsappAudioMetadata=()=>{};",
  };
  const out = await build({
    entryPoints: ["src/lib/voice/server.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "voice-fixture",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            args.path in stubs
              ? { path: args.path, namespace: "voice-stub" }
              : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: "voice-stub" }, (args) => ({
            contents: stubs[args.path],
            loader: "js",
          }));
        },
      },
    ],
  });
  api = await import(
    "data:text/javascript;base64," +
      Buffer.from(out.outputFiles[0].text).toString("base64")
  );
});
after(() => delete host.__voiceHarness);
const command = () => ({
  type: "transcribe",
  requestId,
  brandId: "main",
  source: "conversation",
  sourceId: thread,
  messageId: assetId,
});
test("running or completed persisted requests reconcile before requiring an audio download or another model call", async () => {
  fixture();
  f.downloadFailure = true;
  assert.deepEqual(await api.actVoice(company, command()), {
    state: "running",
  });
  assert.equal(f.genCalls, 0);
  assert.ok(!f.calls.includes("private-audio-download"));
  f.claim = { dispatch: false, status: "completed" };
  f.transcript = {
    id: requestId,
    asset_id: assetId,
    original_text: "想預約星期六",
    language: "cantonese",
    extractions: [],
    created_at: new Date().toISOString(),
  };
  const done = await api.actVoice(company, command());
  assert.ok("item" in done);
  assert.equal(f.genCalls, 0);
  assert.ok(!f.calls.includes("private-audio-download"));
});
test("confirmed model failure persists a terminal signal while an unconfirmed transport does not", async () => {
  fixture();
  f.claim = { dispatch: true, status: "running" };
  f.generatedFailure = true;
  await assert.rejects(
    () => api.actVoice(company, command()),
    (e) => e instanceof api.VoiceError && e.terminalFailure === true,
  );
  assert.equal(f.genCalls, 1);
  assert.ok(f.calls.includes("sv_voice_finish"));
  fixture();
  f.claim = { dispatch: false, status: "unknown" };
  await assert.rejects(
    () => api.actVoice(company, command()),
    (e) => e instanceof api.VoiceError && e.terminalFailure === false,
  );
  assert.equal(f.genCalls, 0);
});
test("reload exposes only the current actor's recoverable request ID under exact source scope", async () => {
  fixture();
  f.pending = {
    request_id: requestId,
    actor_id: actor,
    status: "running",
    created_at: new Date().toISOString(),
  };
  const page = await api.readVoice(company, {
    brandId: "main",
    source: "conversation",
    sourceId: thread,
  });
  assert.equal(page.items[0].status, "running");
  assert.equal(page.items[0].requestId, requestId);
  f.pending.actor_id = randomUUID();
  const other = await api.readVoice(company, {
    brandId: "main",
    source: "conversation",
    sourceId: thread,
  });
  assert.equal(other.items[0].status, "running");
  assert.equal(other.items[0].requestId, undefined);
  await assert.rejects(
    () =>
      api.readVoice(company, {
        brandId: "foreign",
        source: "conversation",
        sourceId: thread,
      }),
    /無權/,
  );
  const assetRead = f.calls.find((x) => x.startsWith("sv_voice_assets"));
  assert.ok(
    assetRead?.includes(company) &&
      assetRead.includes(thread) &&
      assetRead.includes("main"),
  );
});
