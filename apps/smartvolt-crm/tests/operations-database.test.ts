import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
import { defaultSettings } from "../src/lib/operations/model";
import { parseEvents } from "../src/lib/meta/protocol";
import { snapshotSchema } from "../src/lib/copilot/model";
import { factsFor } from "../src/lib/copilot/observations";
const db = new PGlite(),
  company = randomUUID(),
  foreign = randomUUID(),
  posOnly = randomUUID(),
  owner = randomUUID(),
  agent = randomUUID(),
  manager = randomUUID(),
  viewer = randomUUID(),
  outsider = randomUUID(),
  connection = randomUUID();
let first: string,
  customer: string,
  serial = 0;
const config = () => structuredClone(defaultSettings);
async function value<T = Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
) {
  return (await db.query<{ v: T }>(sql, args)).rows[0].v;
}
async function act(
  action: string,
  data: object,
  who = owner,
  tenant = company,
  command = randomUUID(),
) {
  return value("select sv_ops_action($1,$2,$3,$4,$5::jsonb)v", [
    tenant,
    who,
    command,
    action,
    JSON.stringify(data),
  ]);
}
async function save(data = config()) {
  const revision = await value<number>(
    "select revision v from sv_ops_settings where company_id=$1",
    [company],
  );
  return act("settings", { revision, data });
}
async function thread(id: string) {
  return value<{
    revision: number;
    assignee_id: string | null;
    customer_id: string;
  }>(
    "select to_jsonb(i)v from smartvolt_private.ops_inquiries i where company_id=$1 and provider='meta'and thread_id=$2",
    [company, id],
  );
}
async function inbound() {
  const remote = String(30000 + ++serial);
  const events = parseEvents({
    object: "page",
    entry: [
      {
        id: "10001",
        messaging: [
          {
            sender: { id: remote },
            recipient: { id: "10001" },
            timestamp: Date.now(),
            message: { mid: `ops-${serial}`, text: "想了解預約安排" },
          },
        ],
      },
    ],
  });
  await db.query("select sv_meta_ingest($1,$2::jsonb)", [
    connection,
    JSON.stringify(events),
  ]);
  return value<string>(
    "select id::text v from sv_meta_threads where connection_id=$1 and peer_id=$2",
    [connection, remote],
  );
}
async function read(
  extra: {
    brand?: string;
    stage?: string;
    search?: string;
    at?: string;
    key?: string;
    actor?: string;
    tenant?: string;
  } = {},
) {
  return value<{
    records: Record<string, unknown>[];
    stages: { id: string; count: number }[];
    metrics: Record<string, number | null>;
    followups: Record<string, unknown>[];
    followupCount: number;
    members: Record<string, unknown>[];
  }>(
    "select sv_ops_read($1,$2,$3,$4,$5,$6,$7,now()-interval '1 day',now()+interval '1 day')v",
    [
      extra.tenant ?? company,
      extra.actor ?? owner,
      extra.brand ?? null,
      extra.stage ?? null,
      extra.search ?? "",
      extra.at ?? null,
      extra.key ?? null,
    ],
  );
}
async function profile(who: string, patch: object = {}) {
  const revision = await value<number>(
    "select coalesce((select revision from sv_agent_routing where company_id=$1 and user_id=$2),0)v",
    [company, who],
  );
  return act("agent", {
    userId: who,
    revision,
    team: "booking",
    capacity: 500,
    brandIds: [],
    paused: false,
    ...patch,
  });
}
async function presence(who: string, status = "online") {
  return value("select sv_ops_presence($1,$2,$3)v", [company, who, status]);
}
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,service_role;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((s) => s.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  for (const u of [owner, agent, manager, viewer, outsider])
    await db.query("insert into auth.users values($1)", [u]);
  await db.exec("set role service_role");
  for (const [id, user, products] of [
    [company, owner, ["crm", "pos"]],
    [foreign, outsider, ["crm"]],
    [posOnly, owner, ["pos"]],
  ] as const) {
    const state = createCompanyState({
      companyId: id,
      companyName: "Synthetic",
      brands: [
        { id: "main", name: "Main", short: "M" },
        { id: "other", name: "Other", short: "O" },
      ],
      team: [{ id: user, name: "Owner", initials: "O" }],
    });
    await db.query(
      "select sv_provision_company($1,'Synthetic',$2,'Owner',$3::jsonb,$4::text[])",
      [id, user, JSON.stringify(state), [...products]],
    );
  }
  for (const [who, role] of [
    [agent, "agent"],
    [manager, "manager"],
    [viewer, "viewer"],
  ])
    await db.query(
      "insert into sv_memberships(company_id,user_id,role,display_name)values($1,$2,$3,$3)",
      [company, who, role],
    );
  await db.query("select sv_meta_save($1,$2,$3::jsonb)", [
    company,
    owner,
    JSON.stringify({
      id: connection,
      brandId: "main",
      channel: "messenger",
      appId: "90001",
      pageId: "10001",
      accountId: "10001",
      label: "Synthetic",
      credentials: { test: true },
    }),
  ]);
  first = await inbound();
  customer = (await thread(first)).customer_id;
});
after(() => db.close());

test("lifecycle initializes for actual identities without manufacturing conversations or conversions", async () => {
  const page = await read();
  assert.equal(page.records.length, 1);
  assert.equal(page.records[0].stage_id, "new");
  assert.equal(page.metrics.confirmedBookings, 0);
  assert.equal(page.metrics.receivedCents, 0);
  assert.equal(
    (await read({ actor: outsider, tenant: foreign })).records.length,
    0,
  );
  await assert.rejects(() => read({ actor: outsider }), /access_denied/);
  await assert.rejects(() => read({ tenant: posOnly }), /product_required/);
});
test("configuration is revision checked, manager owned and cannot refer to another brand", async () => {
  await assert.rejects(
    () => act("settings", { revision: 0, data: config() }, agent),
    /access_denied/,
  );
  await assert.rejects(
    () => act("settings", { revision: 0, data: config() }, viewer),
    /access_denied/,
  );
  const invalid = config();
  invalid.stages.shift();
  await assert.rejects(
    () => act("settings", { revision: 0, data: invalid }),
    /stages_invalid/,
  );
  const data = config();
  data.rules.push({
    id: randomUUID(),
    name: "Scoped",
    enabled: true,
    brandId: "foreign",
    channel: "all",
    team: "",
    tags: [],
    method: "least_open",
    onlineOnly: true,
    maxOpen: 20,
  });
  await assert.rejects(
    () => act("settings", { revision: 0, data }),
    /rules_invalid/,
  );
  await save();
  await assert.rejects(
    () => act("settings", { revision: 0, data: config() }),
    /revision_conflict/,
  );
});
test("stage reasons and receipts survive replay and reject stale colleague edits", async () => {
  const command = randomUUID(),
    data = {
      customerId: customer,
      brandId: "main",
      revision: 0,
      stageId: "qualified",
      reason: "客戶詢問時段",
    };
  await act("stage", data, owner, company, command);
  await act("stage", data, owner, company, command);
  assert.equal(
    await value<number>(
      "select count(*)::int v from sv_customer_events where company_id=$1 and kind='lifecycle-changed'",
      [company],
    ),
    1,
  );
  await assert.rejects(() => act("stage", data), /revision_conflict/);
  await assert.rejects(
    () =>
      act("stage", { ...data, reason: "另一內容" }, owner, company, command),
    /idempotency_conflict/,
  );
  await assert.rejects(
    () => act("stage", { ...data, revision: 1, stageId: "lost", reason: "" }),
    /reason_required/,
  );
  await assert.rejects(
    () => act("stage", { ...data, brandId: "other" }),
    /no rows/,
  );
  assert.equal((await read({ stage: "qualified" })).records.length, 1);
});
test("stage counts and literal search cover all records before stable keyset pagination", async () => {
  for (let i = 0; i < 63; i++) await inbound();
  const p = await read();
  assert.equal(p.records.length, 51);
  assert.equal(
    p.stages.reduce((n, s) => n + s.count, 0),
    64,
  );
  const last = p.records[49];
  const next = await read({
    at: last.updated_at as string,
    key: last.key as string,
  });
  assert.equal(next.records.length, 14);
  assert.equal(
    next.records.some((r) =>
      p.records.slice(0, 50).some((a) => a.key === r.key),
    ),
    false,
  );
  assert.equal((await read({ search: "%" })).records.length, 0);
  assert.equal(
    (await read({ brand: "other" })).stages.reduce((n, s) => n + s.count, 0),
    0,
  );
});
test("online-only routing honors brand/team/capacity and retains a truthful waiting queue", async () => {
  await profile(owner, { paused: true });
  await profile(manager, { paused: true });
  await profile(agent);
  const data = config();
  data.routingEnabled = true;
  data.rules.push({
    id: randomUUID(),
    name: "Booking",
    enabled: true,
    brandId: "main",
    channel: "messenger",
    team: "booking",
    tags: [],
    method: "least_open",
    onlineOnly: true,
    maxOpen: 500,
  });
  await save(data);
  const waiting = await inbound();
  assert.equal((await thread(waiting)).assignee_id, null);
  await presence(agent);
  const routed = await inbound();
  assert.equal((await thread(routed)).assignee_id, agent);
  await profile(agent, { paused: true });
  assert.equal((await thread(await inbound())).assignee_id, null);
  await profile(agent, { brandIds: ["other"] });
  assert.equal((await thread(await inbound())).assignee_id, null);
  await profile(agent);
  await db.query(
    "update sv_agent_routing set seen_at=now()-interval '4 minutes'where company_id=$1 and user_id=$2",
    [company, agent],
  );
  assert.equal((await thread(await inbound())).assignee_id, null);
  await assert.rejects(() => presence(viewer), /access_denied/);
});
test("round-robin advances across real incoming messages and does not steal a human owner", async () => {
  await profile(owner);
  await profile(agent);
  await presence(owner);
  await presence(agent);
  const data = config();
  data.routingEnabled = true;
  data.rules.push({
    id: randomUUID(),
    name: "Rotation",
    enabled: true,
    brandId: null,
    channel: "all",
    team: "booking",
    tags: [],
    method: "round_robin",
    onlineOnly: true,
    maxOpen: 500,
  });
  await save(data);
  const ids = [await inbound(), await inbound(), await inbound()];
  const owners = await Promise.all(
    ids.map(async (id) => (await thread(id)).assignee_id),
  );
  assert.notEqual(owners[0], owners[1]);
  assert.equal(owners[0], owners[2]);
  assert.equal(owners.includes(manager), false);
  assert.equal(owners.includes(viewer), false);
});
test("capacity exhaustion returns queued instead of reporting an invented assignment", async () => {
  const data = config();
  data.routingEnabled = true;
  data.rules.push({
    id: randomUUID(),
    name: "Full",
    enabled: true,
    brandId: null,
    channel: "all",
    team: "booking",
    tags: [],
    method: "least_open",
    onlineOnly: true,
    maxOpen: 1,
  });
  await save(data);
  const id = await inbound(),
    t = await thread(id);
  const result = await value<{ queued: boolean; saved: boolean }>(
    "select sv_inquiry_auto_assign($1,$2,'meta',$3,$4,$5)v",
    [company, owner, id, t.revision, randomUUID()],
  );
  assert.equal(result.queued, true);
  assert.equal(result.saved, false);
  assert.equal((await thread(id)).assignee_id, null);
});
test("stage workflows create one durable follow-up and closing a lifecycle retires pending work", async () => {
  const data = config();
  data.followupsEnabled = true;
  await save(data);
  const id = await inbound(),
    who = (await thread(id)).customer_id;
  const command = randomUUID(),
    change = {
      customerId: who,
      brandId: "main",
      revision: 0,
      stageId: "qualified",
      reason: "想了解預約",
    };
  await act("stage", change, owner, company, command);
  await act("stage", change, owner, company, command);
  assert.equal(
    await value<number>(
      "select count(*)::int v from sv_followup_tasks where company_id=$1 and customer_id=$2",
      [company, who],
    ),
    1,
  );
  await act("stage", {
    ...change,
    revision: 1,
    stageId: "lost",
    reason: "客戶暫時未有需要",
  });
  assert.equal(
    await value<string>(
      "select status v from sv_followup_tasks where company_id=$1 and customer_id=$2",
      [company, who],
    ),
    "cancelled",
  );
});
test("follow-up creation/replay, owner permissions and completion are independent of provider sends", async () => {
  const id = randomUUID();
  const data = {
    provider: "meta",
    threadId: first,
    title: "了解合適時間",
    dueAt: new Date(Date.now() - 60000).toISOString(),
    ownerId: agent,
  };
  await act("followup-create", data, owner, company, id);
  await act("followup-create", data, owner, company, id);
  assert.equal((await read()).followups.filter((f) => f.id === id).length, 1);
  await assert.rejects(
    () =>
      act(
        "followup-update",
        { id, revision: 0, status: "done", dueAt: null },
        viewer,
      ),
    /access_denied/,
  );
  await act(
    "followup-update",
    { id, revision: 0, status: "done", dueAt: null },
    agent,
  );
  await assert.rejects(
    () =>
      act(
        "followup-update",
        { id, revision: 1, status: "open", dueAt: null },
        agent,
      ),
    /invalid/,
  );
  assert.equal(
    await value<number>(
      "select count(*)::int v from sv_meta_messages where company_id=$1 and direction='outbound'",
      [company],
    ),
    0,
  );
});
async function aiResult(id: string) {
  await value("select sv_ai_configure($1,$2,true)v", [company, owner]);
  const request = randomUUID(),
    t = await thread(id),
    rev = await value<number>(
      "select revision v from sv_workspaces where company_id=$1",
      [company],
    );
  await value(
    "select sv_ai_claim($1,$2,$3,'main','meta',$4,$5,$6,'synthetic/model',$7)v",
    [company, owner, request, id, rev, t.revision, "a".repeat(64)],
  );
  await value("select sv_ai_finish($1,$2,$3,$4::jsonb,null,10,10)v", [
    company,
    owner,
    request,
    JSON.stringify({
      summary: "客戶想了解預約時段",
      interest: "high",
      nextStep: "確認客戶方便日期",
      decision: "draft",
    }),
  ]);
  const life = await value<{ revision: number }>(
    "select to_jsonb(l)v from sv_customer_lifecycle l where company_id=$1 and customer_id=$2 and brand_id='main'",
    [company, t.customer_id],
  );
  return {
    provider: "meta",
    threadId: id,
    customerId: t.customer_id,
    requestId: request,
    revision: t.revision,
    linkRevision: 0,
    lifecycleRevision: life.revision,
    stageId: null,
    reason: "核實後採納",
  };
}
test("AI handoff adopts only saved answers and replays without trusting a client summary", async () => {
  const id = await inbound(),
    data = await aiResult(id),
    command = randomUUID();
  await act(
    "handoff",
    { ...data, summary: "forged client output" },
    owner,
    company,
    command,
  );
  await act(
    "handoff",
    { ...data, summary: "forged client output" },
    owner,
    company,
    command,
  );
  assert.equal(
    await value<string>(
      "select summary v from sv_ai_handoffs where company_id=$1 and request_id=$2",
      [company, data.requestId],
    ),
    "客戶想了解預約時段",
  );
  assert.equal(
    await value<string>(
      "select stage_id v from sv_customer_lifecycle where company_id=$1 and customer_id=$2",
      [company, data.customerId],
    ),
    "new",
  );
  await assert.rejects(() => act("handoff", data), /duplicate key/);
});
test("AI handoff fails atomically when transcript or identity/lifecycle context changes", async () => {
  const id = await inbound(),
    data = await aiResult(id);
  await db.query(
    "update sv_meta_threads set revision=revision+1 where company_id=$1 and id=$2",
    [company, id],
  );
  await assert.rejects(() => act("handoff", data), /context_changed/);
  assert.equal(
    await value<number>(
      "select count(*)::int v from sv_ai_handoffs where company_id=$1 and request_id=$2",
      [company, data.requestId],
    ),
    0,
  );
  const other = await inbound(),
    current = await aiResult(other);
  await assert.rejects(
    () => act("handoff", { ...current, customerId: customer }),
    /context_changed/,
  );
});
test("manual won labels cannot create booking/attendance/payment metrics", async () => {
  const id = await inbound(),
    who = (await thread(id)).customer_id;
  await act("stage", {
    customerId: who,
    brandId: "main",
    revision: 0,
    stageId: "customer",
    reason: "同事標記",
  });
  const m = (await read()).metrics;
  assert.equal(m.confirmedBookings, 0);
  assert.equal(m.attended, 0);
  assert.equal(m.receivedCents, 0);
  const at = Date.now();
  const snapshot = {
    id: "ops-ap",
    contactId: who,
    brandId: "main",
    status: "confirmed",
    serviceName: "Synthetic service",
  };
  await db.query(
    "insert into sv_pos_appointments values($1,'ops-ap','main',$2,'service',$3,$4,'confirmed',1,1,$5::jsonb)",
    [company, who, at, at + 1800000, JSON.stringify(snapshot)],
  );
  await db.query(
    "update sv_pos_appointments set status='checked_in',workspace_revision=2,snapshot=$2::jsonb where company_id=$1 and id='ops-ap'",
    [company, JSON.stringify({ ...snapshot, status: "checked_in" })],
  );
  await db.query(
    "insert into sv_pos_orders values($1,'ops-order','OPS-1','main',$2,'ops-ap',10000,0,10000,false,$3,2,'{}')",
    [company, who, at],
  );
  await db.query(
    "insert into sv_pos_payments values($1,'ops-pay','ops-order',10000,'cash','',$2,'Synthetic','manual_verified',3,'{\"amountCents\":10000}')",
    [company, at],
  );
  await db.query(
    "insert into sv_pos_refunds values($1,'ops-refund','ops-order',3000,'Synthetic',$2,'Synthetic','manual_verified',4,'{\"amountCents\":3000}')",
    [company, at],
  );
  const actual = (await read()).metrics;
  assert.equal(actual.confirmedBookings, 1);
  assert.equal(actual.attended, 1);
  assert.equal(actual.receivedCents, 10000);
  assert.equal(actual.refundedCents, 3000);
  assert.equal((await read({ brand: "other" })).metrics.receivedCents, 0);
});
test("all new operations tables and RPCs deny browser roles; accepted AI receipts cannot be rewritten", async () => {
  for (const table of [
    "sv_ops_settings",
    "sv_lifecycle_stages",
    "sv_customer_lifecycle",
    "sv_agent_routing",
    "sv_followup_tasks",
    "sv_ai_handoffs",
  ])
    assert.equal(
      await value<boolean>(
        "select has_table_privilege('authenticated',$1,'select,insert,update,delete')v",
        [table],
      ),
      false,
    );
  await assert.rejects(
    () =>
      db.query(
        "update sv_ai_handoffs set summary='rewritten'where company_id=$1",
        [company],
      ),
    /permission denied|immutable/,
  );
  assert.equal(
    await value<boolean>(
      "select has_function_privilege('anon','sv_ops_action(uuid,uuid,uuid,text,jsonb)','execute')v",
    ),
    false,
  );
  await assert.rejects(
    () =>
      value("select sv_ops_context($1,$2,'meta',$3)v", [
        company,
        outsider,
        first,
      ]),
    /access_denied/,
  );
});

test("waiting routing rotates past unmatched work and catches up after an agent returns", async () => {
  await profile(owner, { paused: true });
  await profile(manager, { paused: true });
  await profile(agent, { capacity: 1 });
  await presence(agent);
  const data = config();
  data.routingEnabled = true;
  data.rules.push({
    id: randomUUID(),
    name: "VIP",
    enabled: true,
    brandId: null,
    channel: "all",
    team: "booking",
    tags: ["vip"],
    method: "least_open",
    onlineOnly: true,
    maxOpen: 1,
  });
  await save(data);
  // Clear the agent's earlier load, preserving immutable routing history.
  await db.query(
    "update sv_meta_threads set assignee_id=null where company_id=$1 and assignee_id=$2",
    [company, agent],
  );
  const id = await inbound(),
    who = (await thread(id)).customer_id;
  await db.query(
    "update sv_customers set tags='[\"vip\"]'where company_id=$1 and id=$2",
    [company, who],
  );
  for (let i = 0; i < 10 && !(await thread(id)).assignee_id; i++)
    await value("select sv_ops_route_waiting($1,$2)v", [company, agent]);
  assert.equal((await thread(id)).assignee_id, agent);
  assert.equal(
    await value<string>(
      "select state v from sv_routing_queue where company_id=$1 and thread_id=$2",
      [company, id],
    ),
    "assigned",
  );
  assert.equal(
    await value<number>(
      "select count(*)::int v from sv_customer_events where company_id=$1 and kind='routing-assigned'and detail->>'threadId'=$2",
      [company, id],
    ),
    1,
  );
});
test("follow-up keyset pages and due inbox counts include every task without double counting a thread", async () => {
  const dueAt = new Date(Date.now() - 60000).toISOString();
  for (let i = 0; i < 53; i++)
    await act("followup-create", {
      provider: "meta",
      threadId: first,
      title: `Follow up ${i}`,
      dueAt,
      ownerId: agent,
    });
  const page = await value<{
    tasks: { id: string; due_at: string }[];
    total: number;
  }>("select sv_ops_tasks($1,$2)v", [company, owner]);
  assert.equal(page.tasks.length, 51);
  assert.equal(page.total, 53);
  const last = page.tasks[49],
    next = await value<{ tasks: { id: string }[]; total: number }>(
      "select sv_ops_tasks($1,$2,null,$3,$4)v",
      [company, owner, last.due_at, last.id],
    );
  assert.equal(next.tasks.length, 3);
  assert.equal(
    new Set([...page.tasks.slice(0, 50), ...next.tasks].map((x) => x.id)).size,
    53,
  );
  const inbox = await value<{
    threads: { id: string }[];
    counts: { overdue: number };
  }>("select sv_inbox_list($1,$2,'overdue')v", [company, owner]);
  assert.equal(inbox.counts.overdue, 1);
  assert.equal(inbox.threads[0].id, first);
  const attention = await value<{ due: number }>(
    "select sv_ops_attention($1,$2)v",
    [company, agent],
  );
  assert.equal(attention.due, 1);
});
test("saved AI cannot be applied after a real relink or a colleague's stage change", async () => {
  const id = await inbound(),
    data = await aiResult(id);
  await value(
    "select sv_customer_relink($1,$2,'meta',$3,$4,0,$5,'Confirmed identity')v",
    [company, owner, id, customer, randomUUID()],
  );
  await assert.rejects(() => act("handoff", data), /context_changed/);
  const other = await inbound(),
    fresh = await aiResult(other);
  await act("stage", {
    customerId: fresh.customerId,
    brandId: "main",
    revision: 0,
    stageId: "booking",
    reason: "同事已開始安排",
  });
  await assert.rejects(
    () => act("handoff", { ...fresh, stageId: "qualified" }),
    /revision_conflict/,
  );
});
test("C shares the due-work authority, labels lifecycle evidence correctly and keeps POS scope separate", async () => {
  const crm = snapshotSchema.parse(
    await value("select sv_copilot_snapshot($1,$2,'crm')v", [company, owner]),
  );
  assert.equal(crm.overdue, 1);
  assert.equal(crm.followupTasks, 53);
  const facts = factsFor(crm);
  assert.ok(
    facts.some((f) => f.id === "followup-tasks" && f.value.includes("53 項")),
  );
  assert.ok(
    facts.some(
      (f) =>
        f.id === "lifecycle:customer" && f.value.includes("不代表實際預約"),
    ),
  );
  const pos = snapshotSchema.parse(
    await value("select sv_copilot_snapshot($1,$2,'pos')v", [company, owner]),
  );
  assert.equal(pos.followupTasks, undefined);
  assert.equal(pos.lifecycleStages, undefined);
  assert.equal(
    factsFor(pos).some((f) => f.id.startsWith("lifecycle:")),
    false,
  );
});
