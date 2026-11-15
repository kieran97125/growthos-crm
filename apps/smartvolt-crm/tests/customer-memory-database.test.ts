import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
import { memoryCommandSchema } from "../src/lib/customer-memory/model";

const db = new PGlite(),
  owner = randomUUID(),
  agent = randomUUID(),
  viewer = randomUUID(),
  outsider = randomUUID();
async function value<T = Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
): Promise<T> {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
const rpc = <T = Record<string, unknown>>(fn: string, args: unknown[]) =>
  value<T>(
    `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})v`,
    args,
  );
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fixture(legacyBooking = false) {
  const company = randomUUID(),
    customer = "customer-" + randomUUID(),
    other = "customer-" + randomUUID(),
    conversation = "conversation-" + randomUUID();
  const state = createCompanyState({
    companyId: company,
    companyName: "Synthetic memory",
    brands: [
      { id: "main", name: "Main", short: "M" },
      { id: "other", name: "Other", short: "O" },
    ],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
  state.inbox.contacts.push(
    ...[customer, other].map((id) => ({
      id,
      clientId: company,
      name: "Synthetic",
      initials: "S",
      phone: "",
      email: "",
      company: "",
      tags: [],
      source: "synthetic",
      createdAt: 1,
      note: "",
    })),
  );
  state.inbox.conversations.push(
    {
      id: conversation,
      clientId: company,
      brandId: "main",
      contactId: customer,
      channel: "whatsapp",
      status: "open",
      owner,
      priority: false,
      pinned: false,
      unread: 0,
      snoozedUntil: null,
      subject: "Synthetic",
      updatedAt: 1,
    },
    {
      id: "other-" + conversation,
      clientId: company,
      brandId: "other",
      contactId: other,
      channel: "whatsapp",
      status: "open",
      owner,
      priority: false,
      pinned: false,
      unread: 0,
      snoozedUntil: null,
      subject: "Other",
      updatedAt: 1,
    },
  );
  state.inbox.messages.push({
    id: "m1",
    conversationId: conversation,
    kind: "incoming",
    body: "只方便星期六下午",
    author: "Synthetic",
    at: 1,
    replyTo: null,
  });
  if (legacyBooking)
    state.inbox.bookings.push({
      id: "scheduled-booking",
      conversationId: conversation,
      contactId: customer,
      service: "Synthetic service",
      branch: "Synthetic branch",
      date: "2026-11-20",
      time: "14:30",
      guests: 1,
      customerConfirmed: true,
      status: "confirmed",
    });
  await rpc("sv_provision_company", [
    company,
    "Synthetic memory",
    owner,
    "Owner",
    JSON.stringify(state),
    ["crm", "pos"],
  ]);
  await db.query(
    "insert into public.sv_memberships(company_id,user_id,role,display_name)values($1,$2,'agent','Agent'),($1,$3,'viewer','Viewer')",
    [company, agent, viewer],
  );
  await rpc("sv_ai_configure", [company, owner, true]);
  return { company, customer, other, conversation };
}
const read = (
  f: Fixture,
  actor = owner,
  brand: string | null = "main",
  before: string | null = null,
  key: string | null = null,
) =>
  rpc<{
    brandId: string;
    brands: { id: string }[];
    memories: { id: string; content: string; revision: number }[];
    history: { revision: number; status: string; reason: string }[];
    timeline: {
      key: string;
      at: string;
      kind: string;
      data: Record<string, unknown>;
    }[];
  }>("sv_customer_memory_read", [
    f.company,
    actor,
    f.customer,
    brand,
    before,
    key,
  ]);
const command = (
  f: Fixture,
  data: Record<string, unknown> = {},
  id = randomUUID(),
  actor = owner,
) =>
  rpc("sv_customer_memory_action", [
    f.company,
    actor,
    f.customer,
    id,
    JSON.stringify({
      brandId: "main",
      action: "save",
      memoryId: randomUUID(),
      expectedRevision: 0,
      category: "preference",
      content: "只方便星期六下午",
      reason: "客戶已親自確認",
      ...data,
    }),
  ]);
const context = (
  f: Fixture,
  source = "conversation",
  sourceId = f.conversation,
) =>
  rpc<{
    customerId: string;
    stamp: string;
    guidance: { id: string; content: string }[];
    reviewedVoice: {
      id: string;
      revision: number;
      text: string;
      contentHash: string;
    }[];
  }>("sv_customer_memory_context", [
    f.company,
    owner,
    "main",
    source,
    sourceId,
  ]);
const aiClaim = async (
  f: Fixture,
  id: string,
  stamp: string,
  hash = "a".repeat(64),
) =>
  rpc<{ dispatch: boolean; status: string; error_code: string }>(
    "sv_memory_ai_claim",
    [
      f.company,
      owner,
      id,
      "main",
      "conversation",
      f.conversation,
      await value<number>(
        "select revision v from sv_workspaces where company_id=$1",
        [f.company],
      ),
      null,
      "synthetic/model",
      hash,
      stamp,
    ],
  );
const aiFinish = (f: Fixture, id: string) =>
  rpc<{ status: string; result: unknown; error_code: string }>(
    "sv_memory_ai_finish",
    [f.company, owner, id, JSON.stringify({ answer: "Synthetic" }), null, 3, 4],
  );

before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to service_role,authenticated;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter(
      (f) =>
        f.endsWith(".sql") &&
        (f <= "20261115094755_convelta_cs_coaching.sql" ||
          f.endsWith("_convelta_customer_memory.sql") ||
          f.endsWith("_convelta_completed_draft_freshness.sql") ||
          f.endsWith("_convelta_voice_transcription.sql")),
    )
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.query("insert into auth.users values($1),($2),($3),($4)", [
    owner,
    agent,
    viewer,
    outsider,
  ]);
  await db.exec("set role service_role");
});
after(() => db.close());

test("customer memory reads only authorized customer brands and does not infer identity", async () => {
  const f = await fixture(),
    page = await read(f, owner, null);
  assert.equal(page.brandId, "main");
  assert.deepEqual(page.brands, [{ id: "main", name: "Main" }]);
  assert.equal(page.memories.length, 0);
  await assert.rejects(() => read(f, outsider), /access_denied/);
  await assert.rejects(() => read(f, owner, "other"), /memory_customer_scope/);
  await db.query(
    "update public.sv_memberships set brand_ids=array['other']where company_id=$1 and user_id=$2",
    [f.company, agent],
  );
  await assert.rejects(() => read(f, agent), /brand_scope/);
  await db.query(
    "update public.sv_memberships set product_ids=array['pos']where company_id=$1 and user_id=$2",
    [f.company, agent],
  );
  await assert.rejects(() => read(f, agent), /product_required/);
});
test("memory revisions are append-only and an exact retry cannot duplicate or rewrite a correction", async () => {
  const f = await fixture(),
    mid = randomUUID(),
    id = randomUUID(),
    first = { memoryId: mid };
  assert.equal((await command(f, first, id)).revision, 1);
  assert.equal((await command(f, first, id)).revision, 1);
  await assert.rejects(
    () => command(f, { ...first, content: "Different" }, id),
    /idempotency_conflict/,
  );
  await command(f, {
    memoryId: mid,
    expectedRevision: 1,
    content: "改為星期日下午",
    reason: "客戶更正方便時間",
  });
  let page = await read(f);
  assert.equal(page.memories[0].revision, 2);
  assert.equal(page.memories[0].content, "改為星期日下午");
  assert.equal(page.history.length, 2);
  await assert.rejects(
    () => command(f, { memoryId: mid, expectedRevision: 1 }),
    /revision_conflict/,
  );
  await command(f, {
    action: "archive",
    memoryId: mid,
    expectedRevision: 2,
    reason: "客戶表示不再適用",
  });
  page = await read(f);
  assert.equal(page.memories.length, 0);
  assert.equal(page.history[0].status, "archived");
  assert.equal(page.history.length, 3);
  await assert.rejects(
    () => command(f, {}, randomUUID(), viewer),
    /access_denied/,
  );
  await assert.rejects(
    () =>
      db.query(
        "update sv_customer_memories set content='rewrite'where company_id=$1",
        [f.company],
      ),
    /permission denied|immutable/,
  );
});
test("timeline merges exact linked messages, facts and events with stable cursor and brand isolation", async () => {
  const f = await fixture();
  await command(f);
  await db.query(
    "insert into sv_customer_events(company_id,customer_id,brand_id,event_key,kind,detail,created_at)select $1,$2,'main','synthetic:'||n,'booking-confirm',jsonb_build_object('service','Synthetic','status','confirmed'),now() from generate_series(1,60)n",
    [f.company, f.customer],
  );
  const first = await read(f);
  assert.equal(first.timeline.length, 51);
  const after = first.timeline[49],
    second = await read(f, owner, "main", after.at, after.key);
  assert.equal(
    new Set(
      [...first.timeline.slice(0, 50), ...second.timeline].map((x) => x.key),
    ).size,
    62,
  );
  assert.ok(
    second.timeline.some(
      (x) =>
        x.kind === "message-incoming" && x.data.body === "只方便星期六下午",
    ),
  );
  assert.ok(!first.timeline.some((x) => JSON.stringify(x).includes("Other")));
});
test("POS evidence is filtered before timeline pagination for CRM-only actors", async () => {
  const f = await fixture();
  await db.query(
    "insert into sv_customer_events(company_id,customer_id,brand_id,event_key,kind,detail,created_at)select $1,$2,'main','pos-synthetic:'||n,'pos-payment',jsonb_build_object('amountCents',1000,'id','synthetic-'||n),now()from generate_series(1,70)n",
    [f.company, f.customer],
  );
  await db.query(
    "update public.sv_memberships set product_ids=array['crm']where company_id=$1 and user_id=$2",
    [f.company, agent],
  );
  assert.equal((await read(f, owner)).timeline.length, 51);
  const limited = await read(f, agent);
  assert.equal(limited.timeline.length, 1);
  assert.ok(limited.timeline.every((x) => !x.kind.startsWith("pos-")));
});
test("legacy appointments use their explicit Hong Kong scheduled time without inventing a creation time", async () => {
  const f = await fixture(true),
    page = await read(f),
    booking = page.timeline.find((x) => x.kind === "legacy-booking");
  assert.ok(booking);
  assert.equal(Date.parse(booking.at), Date.parse("2026-11-20T14:30:00+08:00"));
  assert.equal(booking.data.timeBasis, "scheduled");
});
test("AI preference context is bounded and an unselected current fact still participates in freshness", async () => {
  const f = await fixture(),
    ids = Array.from({ length: 12 }, () => randomUUID());
  for (const memoryId of ids)
    await command(f, { memoryId, content: "客戶確認內容".repeat(100) });
  const original = await context(f);
  assert.equal(original.guidance.length, 8);
  assert.ok(original.guidance.every((x) => x.content.length <= 500));
  await command(f, {
    memoryId: ids.find((id) => !original.guidance.some((x) => x.id === id)),
    expectedRevision: 1,
    content: "客戶已更正內容",
    reason: "原客戶重新確認",
  });
  assert.notEqual((await context(f)).stamp, original.stamp);
});
test("source-derived memory stays bounded and correction invalidates claim, finish and completed replay", async () => {
  const f = await fixture(),
    mid = randomUUID();
  await command(f, { memoryId: mid });
  const original = await context(f);
  assert.equal(original.customerId, f.customer);
  assert.deepEqual(
    original.guidance.map((x) => x.content),
    ["只方便星期六下午"],
  );
  const id = randomUUID();
  assert.equal((await aiClaim(f, id, original.stamp)).dispatch, true);
  assert.equal((await aiClaim(f, id, original.stamp)).dispatch, false);
  await command(f, {
    memoryId: mid,
    expectedRevision: 1,
    content: "已改為星期日下午",
    reason: "客戶再次更正需要",
  });
  const changed = await context(f);
  assert.notEqual(changed.stamp, original.stamp);
  const failed = await aiFinish(f, id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error_code, "context_changed");
  assert.equal(failed.result, null);
  await assert.rejects(() => aiClaim(f, id, original.stamp), /context_changed/);
  const next = randomUUID();
  await aiClaim(f, next, changed.stamp);
  assert.equal((await aiFinish(f, next)).status, "completed");
  await command(f, {
    action: "archive",
    memoryId: mid,
    expectedRevision: 2,
    reason: "此偏好已不再適用",
  });
  assert.equal((await aiFinish(f, next)).status, "failed");
  assert.equal(
    await value(
      "select status v from sv_ai_requests where company_id=$1 and request_id=$2",
      [f.company, next],
    ),
    "completed",
  );
});
test("native source relinking invalidates its memory identity and cannot carry former customer guidance", async () => {
  const f = await fixture(),
    conn = randomUUID(),
    thread = randomUUID(),
    unique = Date.now().toString() + Math.floor(Math.random() * 100000);
  await db.query(
    "insert into sv_meta_connections(id,company_id,brand_id,channel,app_id,page_id,account_id,label,credentials)values($1,$2,'main','messenger',$3,$3,$3,'Synthetic','{}')",
    [conn, f.company, unique],
  );
  await db.query(
    "insert into sv_meta_threads(id,company_id,connection_id,peer_id)values($1,$2,$3,'987654321')",
    [thread, f.company, conn],
  );
  await rpc("sv_customer_relink", [
    f.company,
    owner,
    "meta",
    thread,
    f.customer,
    0,
    randomUUID(),
    "Synthetic reviewed identity",
  ]);
  await command(f);
  const old = await context(f, "meta", thread);
  assert.equal(old.customerId, f.customer);
  assert.equal(old.guidance.length, 1);
  const second = "same-name-" + randomUUID();
  await db.query(
    "insert into sv_customers(company_id,id,name)values($1,$2,'Synthetic')",
    [f.company, second],
  );
  await db.query("insert into sv_customer_brands values($1,$2,'main')", [
    f.company,
    second,
  ]);
  await rpc("sv_customer_relink", [
    f.company,
    owner,
    "meta",
    thread,
    second,
    1,
    randomUUID(),
    "Different reviewed customer",
  ]);
  const current = await context(f, "meta", thread);
  assert.equal(current.customerId, second);
  assert.equal(current.guidance.length, 0);
  assert.notEqual(current.stamp, old.stamp);
});
test("completed draft validation is scoped, detects later corrections and never claims new AI usage", async () => {
  const f = await fixture(),
    mid = randomUUID();
  await command(f, { memoryId: mid });
  const original = await context(f),
    id = randomUUID();
  await aiClaim(f, id, original.stamp);
  await aiFinish(f, id);
  const validate = (request = id, stamp = original.stamp, actor = owner) =>
    rpc("sv_memory_ai_validate", [f.company, actor, request, stamp]);
  assert.equal(await validate(), true);
  await assert.rejects(
    () => validate(id, original.stamp, viewer),
    /access_denied/,
  );
  await assert.rejects(() => validate(randomUUID()), /context_changed/);
  const running = randomUUID();
  await aiClaim(f, running, original.stamp);
  await assert.rejects(() => validate(running), /context_changed/);
  await command(f, {
    memoryId: mid,
    expectedRevision: 1,
    content: "改為星期日",
    reason: "客人再次確認方便時間",
  });
  await assert.rejects(() => validate(), /context_changed/);
  assert.equal(
    await value<number>(
      "select count(*)::integer v from sv_ai_requests where company_id=$1",
      [f.company],
    ),
    2,
  );
  assert.equal(
    await value<string>(
      "select status v from sv_ai_requests where company_id=$1 and request_id=$2",
      [f.company, id],
    ),
    "completed",
  );
  assert.equal(
    await value<boolean>(
      "select has_function_privilege('authenticated','public.sv_memory_ai_validate(uuid,uuid,uuid,text)','EXECUTE')v",
    ),
    false,
  );
});
test("only reviewed voice enters atomic customer context and a later transcript correction blocks reply publication", async () => {
  const f = await fixture(),
    asset = randomUUID(),
    transcript = randomUUID(),
    original = await context(f);
  await rpc("sv_voice_register", [
    f.company,
    owner,
    asset,
    JSON.stringify({
      brandId: "main",
      source: "conversation",
      sourceId: f.conversation,
      messageId: asset,
      origin: "staff_upload",
      contentHash: "b".repeat(64),
      mimeType: "audio/mpeg",
      audioBytes: 12,
      durationSeconds: 5,
    }),
  ]);
  await rpc("sv_voice_claim", [
    f.company,
    owner,
    transcript,
    asset,
    "synthetic/asr",
    "d".repeat(64),
  ]);
  await rpc("sv_voice_finish", [
    f.company,
    owner,
    transcript,
    JSON.stringify({
      text: "Synthetic raw transcript must not become confirmed context",
      language: "english",
      extractions: [],
    }),
    null,
  ]);
  let ctx = await context(f);
  assert.equal(ctx.reviewedVoice.length, 0);
  assert.equal(ctx.stamp, original.stamp);
  await rpc("sv_voice_correct", [
    f.company,
    owner,
    transcript,
    randomUUID(),
    0,
    "客戶確認星期六方便到店",
    "Staff checked audio",
    "[]",
  ]);
  ctx = await context(f);
  assert.equal(ctx.reviewedVoice.length, 1);
  assert.equal(ctx.reviewedVoice[0].id, transcript);
  assert.equal(ctx.reviewedVoice[0].revision, 1);
  assert.equal(ctx.reviewedVoice[0].contentHash, "b".repeat(64));
  const request = randomUUID();
  await aiClaim(f, request, ctx.stamp);
  await rpc("sv_voice_correct", [
    f.company,
    owner,
    transcript,
    randomUUID(),
    1,
    "客戶改為星期日方便到店",
    "Staff corrected audio",
    "[]",
  ]);
  assert.notEqual((await context(f)).stamp, ctx.stamp);
  assert.equal((await aiFinish(f, request)).error_code, "context_changed");
  const reviewed = (await read(f)).timeline.filter(
    (x) => x.kind === "voice-reviewed",
  );
  assert.equal(reviewed.length, 2);
  assert.ok(reviewed.some((x) => x.data.text === "客戶改為星期日方便到店"));
});
test("raw memory and AI context tables deny browser privileges; all RPCs are invoker scoped", async () => {
  assert.equal(
    await value<number>(
      "select count(*)::integer v from information_schema.role_table_grants where table_name in('sv_customer_memories','sv_memory_ai_contexts')and grantee in('anon','authenticated','PUBLIC')",
    ),
    0,
  );
  assert.equal(
    await value<boolean>(
      "select bool_and(relrowsecurity)v from pg_class where oid in('sv_customer_memories'::regclass,'sv_memory_ai_contexts'::regclass)",
    ),
    true,
  );
  assert.equal(
    await value<number>(
      "select count(*)::integer v from pg_proc where proname in('sv_customer_memory_scope','sv_customer_memory_action','sv_customer_memory_read','sv_customer_memory_context','sv_memory_ai_claim','sv_memory_ai_finish')and(prosecdef or not(proconfig@>array['search_path=\"\"']))",
    ),
    0,
  );
  await db.exec("reset role;set role authenticated");
  await assert.rejects(
    () => db.query("select *from sv_customer_memories"),
    /permission denied/,
  );
  await db.exec("reset role;set role service_role");
});
test("browser commands cannot provide customer identity, source evidence or AI authority", () => {
  const base = {
    action: "save",
    commandId: randomUUID(),
    memoryId: randomUUID(),
    expectedRevision: 0,
    brandId: "main",
    category: "need",
    content: "想於週末到店",
    reason: "客戶已確認需要",
  };
  assert.ok(memoryCommandSchema.safeParse(base).success);
  for (const injected of [
    { customerId: "other" },
    { source: { kind: "ai" } },
    { verified: true },
    { sourceProduct: "pos" },
  ])
    assert.equal(
      memoryCommandSchema.safeParse({ ...base, ...injected }).success,
      false,
    );
});
