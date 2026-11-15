import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { createCompanyState } from "../src/lib/saas/workspace";

const company = randomUUID(),
  actor = randomUUID(),
  conversation = "synthetic-conversation";
type Harness = {
  receipt: Record<string, unknown> | null;
  retainedStamp: string | null;
  context: Record<string, unknown>;
  access: Record<string, unknown>;
  queries: { table: string; filters: Record<string, unknown> }[];
  rpcCalls: string[];
  modelCalls: number;
  enabled: boolean;
};
let harness: Harness, api: typeof import("../src/lib/ai/server");
const host = globalThis as typeof globalThis & {
  __draftValidationHarness?: Harness;
};
const previousModel = process.env.AI_GATEWAY_MODEL;
class Query {
  filters: Record<string, unknown> = {};
  constructor(private table: string) {}
  select() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters[key] = value;
    return this;
  }
  maybeSingle() {
    return this;
  }
  then(
    resolve: (value: unknown) => unknown,
    reject: (error: unknown) => unknown,
  ) {
    harness.queries.push({ table: this.table, filters: this.filters });
    const scopeMatches = this.filters.company_id === company;
    let data: unknown = null;
    if (this.table === "sv_ai_settings" && scopeMatches)
      data = { enabled: harness.enabled };
    if (
      scopeMatches &&
      this.filters.actor_id === actor &&
      this.filters.request_id === harness.receipt?.request_id
    ) {
      if (this.table === "sv_ai_requests") data = harness.receipt;
      if (this.table === "sv_memory_ai_contexts" && harness.retainedStamp)
        data = { stamp: harness.retainedStamp };
    }
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  }
}
before(async () => {
  process.env.AI_GATEWAY_MODEL = "synthetic/model";
  const stubs: Record<string, string> = {
    "server-only": "export{};",
    "@/lib/saas/server":
      "export const loadCompany=async()=>globalThis.__draftValidationHarness.access;",
    "@/lib/customer-memory/server":
      "export const readMemoryGuidanceForSource=async()=>globalThis.__draftValidationHarness.context;",
    "./generate":
      "export const generateCompanyAnswer=async()=>{globalThis.__draftValidationHarness.modelCalls++;throw new Error('validation must never call a model')};",
  };
  const out = await build({
    entryPoints: ["src/lib/ai/server.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "draft-validation-fixture",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            args.path in stubs
              ? { path: args.path, namespace: "draft-validation-stub" }
              : undefined,
          );
          b.onLoad(
            { filter: /.*/, namespace: "draft-validation-stub" },
            (args) => ({
              contents: stubs[args.path],
              loader: "js",
            }),
          );
        },
      },
    ],
  });
  api = await import(
    "data:text/javascript;base64," +
      Buffer.from(out.outputFiles[0].text).toString("base64")
  );
});
after(() => {
  delete host.__draftValidationHarness;
  if (previousModel === undefined) delete process.env.AI_GATEWAY_MODEL;
  else process.env.AI_GATEWAY_MODEL = previousModel;
});
async function fixture() {
  const state = createCompanyState({
    companyId: company,
    companyName: "Synthetic",
    brands: [{ id: "main", name: "Main", short: "M" }],
    team: [{ id: actor, name: "Owner", initials: "O" }],
  });
  state.inbox.contacts.push({
    id: "synthetic-customer",
    clientId: company,
    name: "Synthetic",
    initials: "S",
    phone: "",
    email: "",
    company: "",
    tags: [],
    note: "",
    source: "synthetic",
    createdAt: 1,
  });
  state.inbox.conversations.push({
    id: conversation,
    clientId: company,
    brandId: "main",
    contactId: "synthetic-customer",
    channel: "whatsapp",
    status: "open",
    owner: actor,
    priority: false,
    pinned: false,
    unread: 0,
    snoozedUntil: null,
    subject: "Synthetic",
    updatedAt: 1,
  });
  state.inbox.messages.push({
    id: "synthetic-message",
    conversationId: conversation,
    kind: "incoming",
    body: "想了解服務",
    author: "Synthetic",
    at: 1,
    replyTo: null,
  });
  state.studio.articles.push({
    id: "synthetic-knowledge",
    clientId: company,
    brandId: "main",
    title: "服務",
    content: "服務由同事核對。",
    source: "Synthetic",
    status: "approved",
    revision: 1,
    validUntil: "2099-12-31",
    keywords: ["服務"],
  });
  const request = {
    companyId: company,
    brandId: "main",
    source: "conversation",
    conversationId: conversation,
    requestId: randomUUID(),
    goal: "answer",
  };
  const answer = {
    requestId: request.requestId,
    reply: "請問你想了解邊方面？",
  };
  harness = {
    receipt: null,
    retainedStamp: "a".repeat(32),
    context: {
      customerId: "synthetic-customer",
      stamp: "a".repeat(32),
      guidance: [],
      reviewedVoice: [],
    },
    access: {},
    queries: [],
    rpcCalls: [],
    modelCalls: 0,
    enabled: true,
  };
  harness.access = {
    company: { id: company, name: "Synthetic" },
    user: { id: actor },
    actor: { role: "owner" },
    scope: { brands: [{ id: "main" }] },
    state,
    revision: 1,
    db: {
      from: (table: string) => new Query(table),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        harness.rpcCalls.push(fn);
        if (fn === "sv_memory_ai_validate")
          return {
            data:
              harness.retainedStamp === args.p_expected_stamp &&
              harness.context.stamp === args.p_expected_stamp,
            error: null,
          };
        assert.equal(fn, "sv_memory_ai_claim");
        harness.receipt = {
          request_id: request.requestId,
          status: "completed",
          result: answer,
          error_code: null,
          feature: "reply",
          product: "crm",
          brand_id: args.p_brand,
          source: args.p_source,
          source_id: args.p_source_id,
          workspace_revision: args.p_workspace_revision,
          model: args.p_model,
          request_hash: args.p_hash,
        };
        return {
          data: { dispatch: false, status: "completed", result: answer },
          error: null,
        };
      },
    },
  };
  host.__draftValidationHarness = harness;
  await api.prepareCompanyAnswer(request);
  harness.rpcCalls = [];
  harness.queries = [];
  return { request, answer, state };
}
test("applying a completed draft checks only actor-owned receipts without claiming quota or calling a model", async () => {
  const { request, answer } = await fixture();
  assert.deepEqual(
    await api.prepareCompanyAnswer(request, { completedOnly: true }),
    answer,
  );
  assert.equal(harness.modelCalls, 0);
  assert.deepEqual(harness.rpcCalls, ["sv_memory_ai_validate"]);
  assert.ok(
    harness.queries
      .filter((q) => q.table !== "sv_ai_settings")
      .every(
        (q) =>
          q.filters.company_id === company &&
          q.filters.actor_id === actor &&
          q.filters.request_id === request.requestId,
      ),
  );
});
for (const status of ["missing", "failed", "running"] as const) {
  test(`${status} receipts cannot generate or reserve another request when applying a draft`, async () => {
    const { request } = await fixture();
    if (status === "missing") harness.receipt = null;
    else harness.receipt!.status = status;
    await assert.rejects(
      () => api.prepareCompanyAnswer(request, { completedOnly: true }),
      /重新生成/,
    );
    assert.equal(harness.modelCalls, 0);
    assert.deepEqual(harness.rpcCalls, []);
  });
}
test("a corrected memory outside the prompt selection still prevents applying the old draft", async () => {
  const { request } = await fixture();
  harness.context.stamp = "b".repeat(32);
  await assert.rejects(
    () => api.prepareCompanyAnswer(request, { completedOnly: true }),
    /客戶背景已更新/,
  );
  assert.deepEqual(harness.rpcCalls, ["sv_memory_ai_validate"]);
});
test("new reviewed voice and changed source messages invalidate a retained suggestion", async () => {
  const { request, state } = await fixture();
  harness.context.reviewedVoice = [
    {
      id: randomUUID(),
      messageId: randomUUID(),
      revision: 1,
      text: "客人改為星期日",
    },
  ];
  await assert.rejects(
    () => api.prepareCompanyAnswer(request, { completedOnly: true }),
    /資料已更新/,
  );
  harness.context.reviewedVoice = [];
  state.inbox.messages[0].body = "我改為星期日";
  await assert.rejects(
    () => api.prepareCompanyAnswer(request, { completedOnly: true }),
    /資料已更新/,
  );
  assert.equal(harness.modelCalls, 0);
});
test("unrelated workspace changes retain an identical exact-customer suggestion", async () => {
  const { request, answer, state } = await fixture();
  harness.access.revision = 2;
  state.inbox.messages.push({
    id: "unrelated",
    conversationId: "another-customer",
    kind: "incoming",
    body: "另一個客戶嘅問題",
    author: "Other",
    at: 2,
    replyTo: null,
  });
  assert.deepEqual(
    await api.prepareCompanyAnswer(request, { completedOnly: true }),
    answer,
  );
});
test("suspended AI and missing retained memory proof block applying an old completed draft", async () => {
  const { request } = await fixture();
  harness.enabled = false;
  await assert.rejects(
    () => api.prepareCompanyAnswer(request, { completedOnly: true }),
    /已暫停 AI/,
  );
  harness.enabled = true;
  harness.retainedStamp = null;
  await assert.rejects(
    () => api.prepareCompanyAnswer(request, { completedOnly: true }),
    /客戶背景已更新/,
  );
  assert.deepEqual(harness.rpcCalls, ["sv_memory_ai_validate"]);
});
