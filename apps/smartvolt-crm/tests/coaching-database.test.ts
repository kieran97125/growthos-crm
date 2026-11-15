import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";

const db = new PGlite();
const owner = randomUUID(),
  agent = randomUUID(),
  viewer = randomUUID(),
  outsider = randomUUID();
type Context = {
  stamp: string;
  workspaceRevision: number;
  sourceRevision: number | null;
  verifiedBooking: boolean;
  label: string | null;
};
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
async function fixture(confirmed = false) {
  const company = randomUUID(),
    conversation = "conversation-" + randomUUID(),
    customer = "customer-" + randomUUID();
  const state = createCompanyState({
    companyId: company,
    companyName: "Synthetic",
    brands: [
      { id: "main", name: "Main", short: "M" },
      { id: "other", name: "Other", short: "O" },
    ],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
  state.inbox.contacts.push({
    id: customer,
    clientId: company,
    name: "Synthetic customer",
    initials: "S",
    phone: "",
    email: "",
    company: "",
    tags: [],
    source: "synthetic",
    createdAt: 1,
    note: "",
  });
  state.inbox.conversations.push({
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
  });
  state.inbox.messages.push(
    {
      id: "m1",
      conversationId: conversation,
      kind: "incoming",
      body: "想了解收費，星期六可以嗎？",
      author: "Synthetic",
      at: 1,
      replyTo: null,
    },
    {
      id: "m2",
      conversationId: conversation,
      kind: "outgoing",
      body: "你好，想了解邊項服務？",
      author: "Owner",
      at: 2,
      replyTo: null,
    },
  );
  if (confirmed)
    state.inbox.bookings.push({
      id: "booking",
      conversationId: conversation,
      contactId: customer,
      service: "Synthetic service",
      branch: "Synthetic branch",
      date: "2026-11-20",
      time: "10:00",
      guests: 1,
      customerConfirmed: true,
      status: "confirmed",
    });
  await rpc("sv_provision_company", [
    company,
    "Synthetic",
    owner,
    "Owner",
    JSON.stringify(state),
    ["crm"],
  ]);
  await db.query(
    "insert into public.sv_memberships(company_id,user_id,role,display_name)values($1,$2,'agent','Agent'),($1,$3,'viewer','Viewer')",
    [company, agent, viewer],
  );
  await rpc("sv_ai_configure", [company, owner, true]);
  return { company, conversation, customer };
}
const context = (f: Fixture, actor = owner, brand = "main") =>
  rpc<Context>("sv_coaching_context", [
    f.company,
    actor,
    brand,
    "conversation",
    f.conversation,
  ]);
async function claim(
  f: Fixture,
  id = randomUUID(),
  actor = owner,
  hash = "a".repeat(64),
) {
  const ctx = await context(f, actor);
  return {
    id,
    ctx,
    receipt: await rpc("sv_coaching_claim", [
      f.company,
      actor,
      id,
      "main",
      "conversation",
      f.conversation,
      ctx.stamp,
      ctx.workspaceRevision,
      "synthetic/model",
      hash,
    ]),
  };
}
function analysis(f: Fixture, id: string, verified = false) {
  return {
    id,
    brandId: "main",
    source: "conversation",
    sourceId: f.conversation,
    createdAt: new Date().toISOString(),
    stale: false,
    nextAction: {
      title: "了解服務",
      reason: "需要更多資料",
      missingFields: ["service"],
      suggestedReply: "你想了解邊項服務？",
      evidence: [{ messageId: "m1", quote: "想了解收費" }],
    },
    quality: {
      status: "reviewed",
      findings: [
        {
          code: "missed_price",
          title: "未回答收費",
          detail: "客人有問收費",
          suggestion: "核實服務後回覆收費",
          severity: "attention",
          evidence: [{ messageId: "m1", quote: "想了解收費" }],
        },
      ],
      lossReason: { code: "unknown", label: "待了解", evidence: [] },
    },
    learning: [
      {
        kind: "pattern",
        title: "了解服務",
        question: "",
        content: "先了解客人需要，再提供合適資料。",
        evidence: [{ messageId: "m2", quote: "想了解邊項服務" }],
      },
    ],
    outcome: {
      verifiedBooking: verified,
      label: verified ? "已核實來源預約" : "未有已核實來源預約",
    },
  };
}
const finish = (
  f: Fixture,
  id: string,
  result: unknown = analysis(f, id),
  actor = owner,
) =>
  rpc("sv_coaching_finish", [
    f.company,
    actor,
    id,
    JSON.stringify(result),
    null,
    12,
    10,
  ]);
const expiry = () =>
  new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
const adopt = async (
  f: Fixture,
  id: string,
  command = randomUUID(),
  actor = owner,
  content = "先了解客人需要，再提供合適資料。",
) =>
  rpc("sv_coaching_adopt", [
    f.company,
    actor,
    id,
    0,
    command,
    "了解服務",
    content,
    expiry(),
    (await context(f)).workspaceRevision,
  ]);

before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to service_role,authenticated;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
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

test("coaching isolates company, brand, product and current member grants", async () => {
  const f = await fixture();
  await assert.rejects(() => context(f, outsider), /access_denied/);
  await assert.rejects(
    () => context(f, owner, "other"),
    /coaching_source_scope/,
  );
  await assert.rejects(() => claim(f, randomUUID(), viewer), /access_denied/);
  await db.query(
    "update public.sv_memberships set brand_ids=array['other'] where company_id=$1 and user_id=$2",
    [f.company, agent],
  );
  await assert.rejects(() => context(f, agent), /brand_scope/);
  await db.query(
    "update public.sv_memberships set product_ids=array['pos'] where company_id=$1 and user_id=$2",
    [f.company, agent],
  );
  await assert.rejects(() => context(f, agent), /product_required/);
});
test("one immutable receipt is persisted, replayed and isolated from reply feature", async () => {
  const f = await fixture(),
    c = await claim(f);
  assert.equal(c.receipt.dispatch, true);
  assert.equal((await claim(f, c.id)).receipt.dispatch, false);
  await assert.rejects(
    () => claim(f, c.id, owner, "b".repeat(64)),
    /ai_idempotency_conflict/,
  );
  assert.equal((await finish(f, c.id)).status, "completed");
  assert.equal((await claim(f, c.id)).receipt.status, "completed");
  await assert.rejects(
    () => rpc("sv_ai_finish", [f.company, owner, c.id, "{}", null, 1, 1]),
    /ai_idempotency_conflict/,
  );
  assert.equal(
    await value(
      "select count(*)::integer v from sv_coaching_analyses where company_id=$1",
      [f.company],
    ),
    1,
  );
  await assert.rejects(() =>
    db.query(
      "update sv_coaching_analyses set result='{}' where company_id=$1",
      [f.company],
    ),
  );
  await assert.rejects(() =>
    db.query("delete from sv_coaching_analyses where company_id=$1", [
      f.company,
    ]),
  );
});
test("coaching consumes shared AI quota and blocks parallel work by one actor", async () => {
  const f = await fixture(),
    c = await claim(f);
  await assert.rejects(() => claim(f), /ai_busy/);
  await finish(f, c.id);
  await db.query(
    "update sv_ai_settings set daily_limit=1 where company_id=$1",
    [f.company],
  );
  await assert.rejects(
    async () =>
      rpc("sv_ai_claim", [
        f.company,
        owner,
        randomUUID(),
        "main",
        "playground",
        null,
        (await context(f)).workspaceRevision,
        null,
        "synthetic/model",
        "b".repeat(64),
      ]),
    /ai_daily_limit/,
  );
});
test("changed source or knowledge cannot publish an analysis generated from old context", async () => {
  const f = await fixture(),
    c = await claim(f);
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{inbox,messages,0,body}','\"Changed\"'::jsonb),revision=revision+1 where company_id=$1",
    [f.company],
  );
  const result = await finish(f, c.id);
  assert.equal(result.status, "failed");
  assert.equal(result.error_code, "context_changed");
  assert.equal(
    await value(
      "select count(*)::integer v from sv_coaching_analyses where company_id=$1",
      [f.company],
    ),
    0,
  );
});
test("verified booking is authoritative, source-linked and not inferred from the model", async () => {
  const f = await fixture(),
    c = await claim(f);
  assert.equal(c.ctx.verifiedBooking, false);
  await assert.rejects(
    () => finish(f, c.id, analysis(f, c.id, true)),
    /coaching_invalid/,
  );
  await finish(f, c.id);
  const booked = await fixture(true),
    b = await claim(booked);
  assert.equal(b.ctx.verifiedBooking, true);
  assert.equal(
    (await finish(booked, b.id, analysis(booked, b.id, true))).status,
    "completed",
  );
});
test("manager adoption adds provenance and audit once without source transcript", async () => {
  const f = await fixture(),
    c = await claim(f);
  await finish(f, c.id);
  await assert.rejects(
    () => adopt(f, c.id, randomUUID(), agent),
    /access_denied/,
  );
  const command = randomUUID(),
    saved = await adopt(f, c.id, command);
  assert.equal(saved.saved, true);
  assert.deepEqual(await adopt(f, c.id, command), saved);
  await assert.rejects(() => adopt(f, c.id), /coaching_already_adopted/);
  await assert.rejects(
    () => adopt(f, c.id, command, owner, "Different"),
    /idempotency_conflict/,
  );
  const article = await value<Record<string, unknown>>(
    "select payload#>'{studio,articles,0}' v from sv_workspaces where company_id=$1",
    [f.company],
  );
  assert.equal(article.id, saved.articleId);
  assert.deepEqual(article.coaching, {
    analysisId: c.id,
    index: 0,
    kind: "pattern",
  });
  assert.equal(article.status, "approved");
  assert.equal(JSON.stringify(article).includes("m1"), false);
  assert.equal(
    await value(
      "select count(*)::integer v from sv_coaching_reviews where company_id=$1",
      [f.company],
    ),
    1,
  );
});
test("adoption and correction reject changed source, while review appends without mutating AI", async () => {
  const f = await fixture(),
    c = await claim(f);
  await finish(f, c.id);
  const command = randomUUID();
  const args = [
    f.company,
    owner,
    c.id,
    command,
    "price",
    "同事核實客人因收費而未預約",
    ["missed_price"],
  ];
  assert.equal((await rpc("sv_coaching_review", args)).saved, true);
  assert.equal((await rpc("sv_coaching_review", args)).saved, true);
  await assert.rejects(
    () =>
      rpc("sv_coaching_review", [
        f.company,
        agent,
        c.id,
        randomUUID(),
        "unknown",
        "待確認原因",
        [],
      ]),
    /access_denied/,
  );
  await assert.rejects(
    () =>
      rpc("sv_coaching_review", [
        f.company,
        owner,
        c.id,
        randomUUID(),
        "unknown",
        "待確認原因",
        ["invented"],
      ]),
    /coaching_invalid/,
  );
  const reason = await value(
    "select result#>>'{quality,lossReason,code}' v from sv_coaching_analyses where company_id=$1 and id=$2",
    [f.company, c.id],
  );
  assert.equal(reason, "unknown");
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{inbox,messages,0,body}','\"Changed\"'::jsonb),revision=revision+1 where company_id=$1",
    [f.company],
  );
  await assert.rejects(() => adopt(f, c.id), /coaching_source_changed/);
  await assert.rejects(
    () =>
      rpc("sv_coaching_review", [
        f.company,
        owner,
        c.id,
        randomUUID(),
        "unknown",
        "待確認原因",
        [],
      ]),
    /coaching_source_changed/,
  );
});
test("browser roles cannot read coaching evidence or execute privileged functions", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role;set role ${role}`);
    await assert.rejects(
      () => db.query("select * from public.sv_coaching_analyses"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("select * from public.sv_coaching_reviews"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        rpc("sv_coaching_context", [
          randomUUID(),
          owner,
          "main",
          "conversation",
          "none",
        ]),
      /permission denied/,
    );
  }
  await db.exec("reset role;set role service_role");
});

test("an interrupted claim never dispatches twice and disabled AI cannot finish", async () => {
  const f = await fixture(),
    c = await claim(f);
  // The receipt guard deliberately prevents changing created_at. A fixture is
  // admitted with the actual default temporarily changed, not evidence edited.
  await finish(f, c.id);
  await db.exec(
    "reset role;alter table sv_ai_requests alter column created_at set default(now()-interval '130 seconds');set role service_role",
  );
  const interrupted = await claim(f);
  await db.exec(
    "reset role;alter table sv_ai_requests alter column created_at set default now();set role service_role",
  );
  const replay = await claim(f, interrupted.id);
  assert.equal(replay.receipt.dispatch, false);
  assert.equal(replay.receipt.status, "failed");
  assert.equal(replay.receipt.error_code, "interrupted");
  const disabled = await claim(f);
  await rpc("sv_ai_configure", [f.company, owner, false]);
  const result = await finish(f, disabled.id);
  assert.equal(result.status, "failed");
  assert.equal(result.error_code, "disabled");
});

test("adopted communication style is excluded from C business-fact snapshots", async () => {
  const f = await fixture(),
    c = await claim(f);
  await finish(f, c.id);
  await adopt(f, c.id);
  const snapshot = await rpc<{ knowledge: unknown[] }>("sv_copilot_snapshot", [
    f.company,
    owner,
    "crm",
    "main",
    null,
  ]);
  assert.deepEqual(snapshot.knowledge, []);
});

test("adoption checks the exact knowledge revision validated by the server", async () => {
  const f = await fixture(),
    c = await claim(f);
  await finish(f, c.id);
  const before = await context(f);
  await db.query(
    "update sv_workspaces set revision=revision+1 where company_id=$1",
    [f.company],
  );
  const after = await context(f);
  assert.equal(after.stamp, before.stamp);
  await assert.rejects(
    () =>
      rpc("sv_coaching_adopt", [
        f.company,
        owner,
        c.id,
        0,
        randomUUID(),
        "Synthetic",
        "先了解需要。",
        expiry(),
        before.workspaceRevision,
      ]),
    /coaching_context_changed/,
  );
  assert.equal((await adopt(f, c.id)).saved, true);
});

test("current WhatsApp booking evidence belongs to this exact source thread", async () => {
  const f = await fixture(),
    connection = randomUUID(),
    contact = randomUUID(),
    thread = randomUUID();
  await db.query(
    "insert into sv_wa_connections(id,company_id,brand_id,app_id,account_id,phone_number_id,encrypted_credentials,verify_token_hash)values($1,$2,'main','900001','900002','900003','{\"v\":1}',repeat('a',64))",
    [connection, f.company],
  );
  await db.query(
    "insert into sv_wa_contacts(id,company_id,display_name)values($1,$2,'Synthetic')",
    [contact, f.company],
  );
  await db.query(
    "insert into sv_wa_conversations(id,company_id,connection_id,contact_id,brand_id,remote_id,remote_kind,last_message_at)values($1,$2,$3,$4,'main','synthetic-wa','bsuid',1)",
    [thread, f.company, connection, contact],
  );
  const customer = await value<string>(
    "select customer_id v from sv_customer_threads where company_id=$1 and provider='whatsapp'and thread_id=$2",
    [f.company, thread],
  );
  const wa = () =>
    rpc<Context>("sv_coaching_context", [
      f.company,
      owner,
      "main",
      "whatsapp",
      thread,
    ]);
  assert.equal((await wa()).verifiedBooking, false);
  const booking = randomUUID();
  await db.query(
    "insert into sv_booking_requests(company_id,id,customer_id,brand_id,provider,thread_id,service,desired_at,guests,status)values($1,$2,$3,'main','whatsapp',$4,'Synthetic',now()+interval'1 day',1,'confirmed')",
    [f.company, booking, customer, thread],
  );
  const confirmed = await wa();
  assert.equal(confirmed.verifiedBooking, true);
  await db.query(
    "update sv_booking_requests set status='cancelled',revision=revision+1 where company_id=$1 and id=$2",
    [f.company, booking],
  );
  const cancelled = await wa();
  assert.equal(cancelled.verifiedBooking, false);
  assert.notEqual(confirmed.stamp, cancelled.stamp);
  // A legacy confirmed local booking for a different source is not success
  // evidence for the WhatsApp thread, even in the same company/brand.
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{inbox,bookings}',$2::jsonb),revision=revision+1 where company_id=$1",
    [
      f.company,
      JSON.stringify([
        {
          id: "other-booking",
          conversationId: f.conversation,
          contactId: f.customer,
          service: "Synthetic",
          branch: "Synthetic",
          date: "2026-11-20",
          time: "10:00",
          guests: 1,
          customerConfirmed: true,
          status: "confirmed",
        },
      ]),
    ],
  );
  assert.equal((await wa()).verifiedBooking, false);
});
