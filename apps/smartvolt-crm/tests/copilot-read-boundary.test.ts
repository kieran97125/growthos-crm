import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";

const company = randomUUID(),
  actor = randomUUID(),
  thread = randomUUID();
class Harness {
  retained = false;
  historyDenied = false;
  lookupError = false;
  queries: { table: string; filters: Record<string, unknown> }[] = [];
  calls: { fn: string; args: Record<string, unknown> }[] = [];
  access = {
    company: { id: company, name: "Synthetic company" },
    user: { id: actor },
    actor: { id: actor, name: "Owner", role: "owner" },
    products: ["crm", "pos"],
    memberScope: { brandIds: null, productIds: null },
    db: null as unknown,
  };
  constructor() {
    this.access.db = this.db;
  }
  db = {
    from: (table: string) => new Query(this, table),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      this.calls.push({ fn, args });
      if (fn === "sv_copilot_snapshot")
        return {
          data: {
            at: new Date().toISOString(),
            from: new Date().toISOString(),
            product: args.p_product,
            brandId: null,
            revision: 0,
            brands: [{ id: "main", name: "Synthetic" }],
            customers: 0,
            inquiries: 0,
            confirmed: 0,
            overdue: 0,
            dormant: 0,
            untagged: 0,
            segments: [],
            pos: null,
            customer: null,
            knowledge: [],
            channels: { connected: 0 },
            lastBroadcastAt: null,
            broadcastCoverage: "unavailable",
          },
          error: null,
        };
      if (fn === "sv_copilot_thread_read")
        return this.historyDenied || !this.retained
          ? { data: null, error: { message: "brand_scope" } }
          : {
              data: [
                {
                  id: "saved-message",
                  role: "user",
                  body: "Synthetic retained history",
                  result: null,
                  created_at: new Date().toISOString(),
                },
              ],
              error: null,
            };
      return { data: [], error: null };
    },
  };
}
class Query {
  filters: Record<string, unknown> = {};
  constructor(
    private h: Harness,
    private table: string,
  ) {}
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }
  gt() {
    return this;
  }
  gte() {
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
  then(resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) {
    this.h.queries.push({ table: this.table, filters: this.filters });
    let data: unknown = [];
    if (this.table === "sv_copilot_threads")
      data = this.h.retained ? { id: thread } : null;
    if (this.table === "sv_ai_settings")
      data = { enabled: true, daily_limit: 30 };
    if (this.table === "sv_ai_runtime")
      data = { model: "synthetic/model", status: "ready" };
    return Promise.resolve({
      data,
      count: 0,
      error:
        this.table === "sv_copilot_threads" && this.h.lookupError
          ? { message: "source unavailable" }
          : null,
    }).then(resolve, reject);
  }
}
let h: Harness, api: typeof import("../src/lib/copilot/server");
const host = globalThis as typeof globalThis & {
  __copilotReadHarness?: Harness;
};
before(async () => {
  const stubs: Record<string, string> = {
    "server-only": "export {};",
    "@/lib/saas/server":
      "export const requireCompany=async()=>globalThis.__copilotReadHarness.access;",
    "@/lib/ai/server":
      "export const aiModel=()=> 'synthetic/model';export class AIServiceError extends Error {};",
    "./generate":
      "export const generateCopilot=()=>{throw new Error('a read must not generate AI')};",
    "./observations":
      "export const factsFor=()=>[];export const observations=()=>[];",
  };
  const output = await build({
    entryPoints: ["src/lib/copilot/server.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "copilot-read-boundary",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            args.path in stubs
              ? { path: args.path, namespace: "copilot-read-test" }
              : undefined,
          );
          b.onLoad(
            { filter: /.*/, namespace: "copilot-read-test" },
            (args) => ({ contents: stubs[args.path], loader: "js" }),
          );
        },
      },
    ],
  });
  api = await import(
    "data:text/javascript;base64," +
      Buffer.from(output.outputFiles[0].text).toString("base64")
  );
});
beforeEach(() => {
  h = new Harness();
  host.__copilotReadHarness = h;
});
after(() => {
  delete host.__copilotReadHarness;
});
const context = { product: "crm", section: "ai" };

test("a new browser-reserved C task loads company context without a persisted thread or model call", async () => {
  const bundle = await api.readCopilot(company, context, thread);
  assert.equal(bundle.companyName, "Synthetic company");
  assert.equal(bundle.ai.canGenerate, true);
  assert.equal(bundle.ai.verified, true);
  assert.deepEqual(bundle.messages, []);
  assert.equal(
    h.calls.some((c) => c.fn === "sv_copilot_thread_read"),
    false,
  );
  assert.ok(
    h.calls.every((c) =>
      [
        "sv_copilot_snapshot",
        "sv_copilot_thread_list",
        "sv_copilot_briefs_list",
      ].includes(c.fn),
    ),
  );
  const lookup = h.queries.find((q) => q.table === "sv_copilot_threads")!;
  assert.deepEqual(lookup.filters, { company_id: company, id: thread });
});

test("retained C history still passes through its strict database authorization", async () => {
  h.retained = true;
  const bundle = await api.readCopilot(company, context, thread);
  assert.equal(bundle.messages[0].body, "Synthetic retained history");
  assert.equal(
    h.calls.find((c) => c.fn === "sv_copilot_thread_read")?.args.p_thread,
    thread,
  );
  h.historyDenied = true;
  await assert.rejects(
    () => api.readCopilot(company, context, thread),
    (error: unknown) =>
      !!error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 403,
  );
});

test("a history lookup outage is not fabricated as a successful empty task", async () => {
  h.lookupError = true;
  await assert.rejects(
    () => api.readCopilot(company, context, thread),
    (error: unknown) =>
      !!error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 503,
  );
  assert.equal(
    h.calls.some((c) => c.fn === "sv_copilot_thread_read"),
    false,
  );
});

test("malformed draft UUIDs are rejected before a history query", async () => {
  await assert.rejects(() => api.readCopilot(company, context, "not-a-uuid"));
  assert.equal(
    h.queries.some((q) => q.table === "sv_copilot_threads"),
    false,
  );
});
