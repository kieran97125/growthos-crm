import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
import { makeNode, type Flow } from "../src/components/crm/studio/model";
const db = new PGlite(),
  owner = randomUUID(),
  viewer = randomUUID(),
  outside = randomUUID();
const cutoff = "20261115164223_convelta_flow_graph_runtime.sql";
async function value<T = unknown>(sql: string, args: unknown[] = []) {
  try {
    return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
  } catch (e) {
    const q = e as { message: string; where?: string };
    throw new Error(q.message + (q.where ? " | " + q.where : ""));
  }
}
const rpc = <T = Record<string, unknown>>(fn: string, args: unknown[]) =>
  value<T>(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})v`, args);
async function fixture(kinds = ["trigger", "message", "end"] as string[]) {
  const company = randomUUID(),
    connection = randomUUID(),
    thread = randomUUID(),
    contact = randomUUID();
  await rpc("sv_provision_company", [
    company,
    "Synthetic",
    owner,
    "Owner",
    JSON.stringify(
      createCompanyState({
        companyId: company,
        companyName: "Synthetic",
        brands: [
          { id: "main", name: "Main", short: "M" },
          { id: "other", name: "Other", short: "O" },
        ],
        team: [{ id: owner, name: "Owner", initials: "O" }],
      }),
    ),
    ["crm", "pos"],
  ]);
  await db.query(
    "insert into sv_memberships(company_id,user_id,role,display_name)values($1,$2,'viewer','Viewer')",
    [company, viewer],
  );
  await db.query(
    "insert into sv_wa_connections(id,company_id,brand_id,app_id,account_id,phone_number_id,encrypted_credentials,verify_token_hash,state,webhook_verified_at)values($1,$2,'main',$3,$3,$3,jsonb_build_object('synthetic',true),$4,'active',now())",
    [
      connection,
      company,
      BigInt("0x" + connection.replaceAll("-", "").slice(0, 12)).toString(),
      "a".repeat(64),
    ],
  );
  await db.query(
    "insert into sv_wa_contacts(id,company_id,display_name)values($1,$2,'Synthetic customer')",
    [contact, company],
  );
  await db.query(
    "insert into sv_wa_conversations(id,company_id,connection_id,contact_id,brand_id,remote_id,remote_kind,last_message_at,last_inbound_at)values($1,$2,$3,$4,'main',$5,'bsuid',$6,$6)",
    [thread, company, connection, contact, "synthetic-" + thread, Date.now()],
  );
  await db.query(
    "insert into sv_wa_messages(company_id,connection_id,conversation_id,direction,body,message_type,provider_id,fingerprint,provider_at,author_name,state)values($1,$2,$3,'incoming','想了解護理','text',$4,repeat('a',64),floor(extract(epoch from now())*1000),'Synthetic customer','accepted')",
    [company, connection, thread, "in-" + randomUUID()],
  );
  const customer = await value<string>(
    "select customer_id v from sv_customer_threads where company_id=$1 and thread_id=$2",
    [company, thread],
  );
  const flow: Flow = {
    id: "custom-flow",
    clientId: company,
    brandId: "main",
    name: "Synthetic drawn graph",
    description: "",
    revision: 1,
    updatedAt: 1,
    nodes: kinds.map((k, i) => ({
      ...makeNode(k as Parameters<typeof makeNode>[0], "n" + i, 0, i * 100),
      config: {
        ...makeNode(k as Parameters<typeof makeNode>[0], "n" + i, 0, 0).config,
        owner,
        message: "你好，請問有咩可以幫你？",
      },
    })),
    edges: kinds.slice(1).map((_, i) => ({
      id: "e" + i,
      source: "n" + i,
      target: "n" + (i + 1),
      sourceHandle: null,
    })),
  };
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{studio,flows}',$2::jsonb)where company_id=$1",
    [company, JSON.stringify([flow])],
  );
  return { company, connection, thread, customer: customer!, flow };
}
const action = (
  f: Awaited<ReturnType<typeof fixture>>,
  kind: string,
  data: object,
  actor = owner,
  command = randomUUID(),
) =>
  rpc("sv_flow_action", [
    f.company,
    actor,
    command,
    kind,
    JSON.stringify({ commandId: command, action: kind, ...data }),
  ]);
const publish = (f: Awaited<ReturnType<typeof fixture>>, extra = {}) =>
  action(f, "publish", {
    flow: f.flow,
    revision: 0,
    trigger: "manual",
    provider: "whatsapp",
    connectionId: f.connection,
    purpose: "service",
    enabled: true,
    deliveries: {},
    ...extra,
  });
const enroll = (f: Awaited<ReturnType<typeof fixture>>, cmd = randomUUID()) =>
  action(f, "enroll", { flowId: f.flow.id, threadId: f.thread }, owner, cmd);
const catchup = (f: Awaited<ReturnType<typeof fixture>>) =>
  rpc("sv_flow_catchup", [f.company]);
const latest = (f: Awaited<ReturnType<typeof fixture>>) =>
  value<{ id: string; state: string; reason: string; node_id: string }>(
    "select to_jsonb(r)v from sv_flow_runs r where company_id=$1 order by created_at desc,id desc limit 1",
    [f.company],
  );
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,service_role;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql") && f <= cutoff)
    .sort()) {
    const sql = readFileSync("supabase/migrations/" + f, "utf8");
    try {
      await db.exec(sql);
    } catch (e) {
      const q = e as {
        message: string;
        position?: string;
        internalQuery?: string;
      };
      const pos = Number(q.position ?? 0);
      throw new Error(
        f +
          ": " +
          q.message +
          " " +
          sql.slice(Math.max(0, pos - 160), pos + 160),
      );
    }
  }
  for (const id of [owner, viewer, outside])
    await db.query("insert into auth.users values($1)", [id]);
  await db.exec("set role service_role");
});
after(() => db.close());
test("published arbitrary graph pins immutable version and same command enrolls once", async () => {
  const f = await fixture();
  await publish(f);
  const cmd = randomUUID();
  await enroll(f, cmd);
  await enroll(f, cmd);
  await enroll(f, randomUUID());
  await catchup(f);
  await catchup(f);
  assert.equal(
    await value(
      "select count(*)::int v from sv_flow_runs where company_id=$1",
      [f.company],
    ),
    1,
  );
  assert.equal(
    await value(
      "select count(*)::int v from sv_delivery_jobs where company_id=$1 and origin='flow'",
      [f.company],
    ),
    1,
  );
  assert.equal((await latest(f)).state, "delivery");
  await assert.rejects(
    db.query("update sv_flow_versions set graph='{}'where company_id=$1", [
      f.company,
    ]),
  );
});
test("no consent skips shared outbox claim and never authorizes a provider POST", async () => {
  const f = await fixture();
  await publish(f);
  await enroll(f);
  await catchup(f);
  const id = await value<string>(
    "select id v from sv_delivery_jobs where company_id=$1 and origin='flow'",
    [f.company],
  );
  const claim = await rpc<{ dispatch: boolean; reason: string }>(
    "sv_delivery_claim",
    [f.company, id],
  );
  assert.equal(claim.dispatch, false);
  assert.equal(claim.reason, "consent_missing");
});
test("pause stops a durable wait and republish cannot migrate an old run", async () => {
  const f = await fixture(["trigger", "delay", "message", "end"]);
  await publish(f);
  await enroll(f);
  await catchup(f);
  assert.equal((await latest(f)).state, "waiting");
  await action(f, "toggle", { flowId: f.flow.id, revision: 1, enabled: false });
  assert.equal((await latest(f)).state, "stopped");
  assert.equal(
    await value(
      "select count(*)::int v from sv_delivery_jobs where company_id=$1",
      [f.company],
    ),
    0,
  );
  await publish(f, { revision: 2 });
  assert.equal(
    await value(
      "select count(*)::int v from sv_flow_versions where company_id=$1",
      [f.company],
    ),
    2,
  );
  assert.equal(
    await value("select version v from sv_flow_runs where company_id=$1", [
      f.company,
    ]),
    1,
  );
});
test("a customer reply during a wait stops the exact run", async () => {
  const f = await fixture(["trigger", "delay", "message", "end"]);
  await publish(f);
  await enroll(f);
  await catchup(f);
  await db.query(
    "insert into sv_wa_messages(company_id,connection_id,conversation_id,direction,body,message_type,provider_id,fingerprint,provider_at,author_name,state)values($1,$2,$3,'incoming','新回覆','text',$4,repeat('a',64),floor(extract(epoch from now())*1000),'Synthetic customer','accepted')",
    [f.company, f.connection, f.thread, "in-" + randomUUID()],
  );
  assert.equal((await latest(f)).reason, "customer_replied");
  assert.equal((await latest(f)).state, "stopped");
});
test("cycles, disconnected nodes and ambiguous exits cannot publish", async () => {
  const f = await fixture();
  for (const graph of [
    {
      ...f.flow,
      edges: [
        ...f.flow.edges,
        { id: "cycle", source: "n1", target: "n0", sourceHandle: null },
      ],
    },
    { ...f.flow, nodes: [...f.flow.nodes, makeNode("end", "orphan", 0, 0)] },
    {
      ...f.flow,
      edges: [
        ...f.flow.edges,
        { id: "extra", source: "n0", target: "n2", sourceHandle: null },
      ],
    },
  ]) {
    await assert.rejects(
      rpc("smartvolt_private.flow_graph_check", [JSON.stringify(graph)]),
    );
  }
});
test("viewer, foreign actor, stale revision and unpublished edits are rejected", async () => {
  const f = await fixture();
  await assert.rejects(
    action(
      f,
      "publish",
      {
        flow: f.flow,
        revision: 0,
        trigger: "manual",
        provider: "whatsapp",
        connectionId: f.connection,
        purpose: "service",
        enabled: true,
        deliveries: {},
      },
      viewer,
    ),
  );
  await assert.rejects(
    action(
      f,
      "publish",
      {
        flow: f.flow,
        revision: 0,
        trigger: "manual",
        provider: "whatsapp",
        connectionId: f.connection,
        purpose: "service",
        enabled: true,
        deliveries: {},
      },
      outside,
    ),
  );
  await assert.rejects(publish(f, { flow: { ...f.flow, name: "Unsaved" } }));
  await publish(f);
  await assert.rejects(publish(f));
});
test("all branch paths use live facts and create a real follow-up card", async () => {
  const f = await fixture(["trigger", "condition", "followup", "end"]);
  const other = makeNode("end", "existing-end", 200, 0);
  f.flow.nodes.push(other);
  f.flow.edges = f.flow.edges.map((e) =>
    e.source === "n1" ? { ...e, sourceHandle: "new" } : e,
  );
  f.flow.edges.push({
    id: "existing-branch",
    source: "n1",
    target: "existing-end",
    sourceHandle: "existing",
  });
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{studio,flows}',$2::jsonb)where company_id=$1",
    [f.company, JSON.stringify([f.flow])],
  );
  await publish(f);
  await enroll(f);
  await catchup(f);
  assert.equal((await latest(f)).state, "completed");
  assert.equal(
    await value(
      "select count(*)::int v from sv_followup_tasks where company_id=$1 and source_key like'manual:%'",
      [f.company],
    ),
    1,
  );
});
test("manual intake is durable intent and cannot satisfy the confirmed-booking review gate", async () => {
  const f = await fixture(["trigger", "form", "review", "reminder"]);
  await publish(f);
  await enroll(f);
  await catchup(f);
  const r = await latest(f);
  assert.equal(r.state, "form");
  await action(f, "continue", {
    flowId: f.flow.id,
    runId: r.id,
    nodeId: r.node_id,
    fields: {
      service: "護理",
      desiredAt: new Date(Date.now() + 86400000).toISOString(),
      note: "客戶提出意向",
    },
  });
  await catchup(f);
  assert.equal((await latest(f)).state, "review");
  await assert.rejects(
    action(f, "continue", {
      flowId: f.flow.id,
      runId: r.id,
      nodeId: "n2",
      bookingId: randomUUID(),
    }),
  );
  assert.equal(
    await value(
      "select count(*)::int v from sv_booking_requests where company_id=$1",
      [f.company],
    ),
    0,
  );
});
test("verified source starts only matching enabled arbitrary graph", async () => {
  const f = await fixture(["trigger", "delay", "message", "end"]);
  await publish(f, { trigger: "unanswered" });
  await db.query(
    "insert into sv_wa_messages(company_id,connection_id,conversation_id,direction,body,message_type,provider_id,fingerprint,provider_at,author_name,state)values($1,$2,$3,'incoming','新查詢','text',$4,repeat('a',64),floor(extract(epoch from now())*1000),'Synthetic customer','accepted')",
    [f.company, f.connection, f.thread, "in-" + randomUUID()],
  );
  assert.equal(
    await value(
      "select count(*)::int v from sv_flow_runs where company_id=$1",
      [f.company],
    ),
    1,
  );
  await catchup(f);
  assert.equal((await latest(f)).state, "waiting");
});
test("private runtime data has no browser table grants and steps cannot be rewritten", async () => {
  assert.equal(
    await value(
      "select count(*)::int v from information_schema.role_table_grants where table_schema='public'and table_name like'sv_flow_%'and grantee in('anon','authenticated')",
    ),
    0,
  );
  const f = await fixture();
  await publish(f);
  await enroll(f);
  await catchup(f);
  await assert.rejects(
    db.query("delete from sv_flow_steps where company_id=$1", [f.company]),
  );
  const page = await rpc<{ runs: { steps: unknown[] }[] }>("sv_flow_read", [
    f.company,
    owner,
    f.flow.id,
  ]);
  assert.ok(page.runs[0].steps.length > 0);
  await assert.rejects(rpc("sv_flow_read", [f.company, outside, f.flow.id]));
});

test("republish keeps an active run on immutable graph and connection settings", async () => {
  const f = await fixture(["trigger", "delay", "message", "end"]);
  await publish(f);
  await enroll(f);
  await catchup(f);
  const run = await latest(f);
  assert.equal(run.state, "waiting");
  const newer = structuredClone(f.flow);
  newer.nodes[2].config.message = "新版文字";
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{studio,flows}',$2::jsonb)where company_id=$1",
    [f.company, JSON.stringify([newer])],
  );
  await publish(f, { flow: newer, revision: 1 });
  assert.equal((await latest(f)).state, "waiting");
  await db.query(
    "update sv_flow_runs set due_at=now()-interval'1 second'where company_id=$1 and id=$2",
    [f.company, run.id],
  );
  await catchup(f);
  assert.equal(
    await value(
      "select payload->>'body'v from sv_delivery_jobs where company_id=$1 and source_id=$2",
      [f.company, run.id],
    ),
    "你好，請問有咩可以幫你？",
  );
  assert.equal(
    await value(
      "select version v from sv_flow_runs where company_id=$1 and id=$2",
      [f.company, run.id],
    ),
    1,
  );
});

test("merchant keyword routes are literal and ambiguous matches use the human branch", async () => {
  for (const ambiguous of [false, true]) {
    const f = await fixture(["trigger", "intent", "end"]);
    f.flow.nodes[1].config.routing = {
      faq: ["護理"],
      booking: ambiguous ? ["了解"] : ["預約"],
      handoff: ["同事"],
    };
    f.flow.nodes.push(
      makeNode("end", "booking-end", 0, 300),
      makeNode("end", "human-end", 100, 300),
    );
    f.flow.edges[1].sourceHandle = "faq";
    f.flow.edges.push(
      {
        id: "book",
        source: "n1",
        target: "booking-end",
        sourceHandle: "booking",
      },
      {
        id: "human",
        source: "n1",
        target: "human-end",
        sourceHandle: "handoff",
      },
    );
    await db.query(
      "update sv_workspaces set payload=jsonb_set(payload,'{studio,flows}',$2::jsonb)where company_id=$1",
      [f.company, JSON.stringify([f.flow])],
    );
    await publish(f);
    await enroll(f);
    await catchup(f);
    assert.equal((await latest(f)).state, "completed");
    assert.equal(
      await value(
        "select detail->>'branch'v from sv_flow_steps where company_id=$1 and node_id='n1'",
        [f.company],
      ),
      ambiguous ? "handoff" : "faq",
    );
    assert.equal(
      await value(
        "select detail->>'method'v from sv_flow_steps where company_id=$1 and node_id='n1'",
        [f.company],
      ),
      "keyword_route",
    );
  }
});

test("handoff creates an owned follow-up card and assigns the real source thread", async () => {
  const f = await fixture(["trigger", "handoff"]);
  await publish(f);
  await enroll(f);
  await catchup(f);
  assert.equal((await latest(f)).state, "handoff");
  assert.equal(
    await value(
      "select assignee_id v from sv_wa_conversations where company_id=$1 and id=$2",
      [f.company, f.thread],
    ),
    owner,
  );
  assert.equal(
    await value(
      "select count(*)::int v from sv_followup_tasks where company_id=$1 and owner_id=$2",
      [f.company, owner],
    ),
    1,
  );
});

test("knowledge changes invalidate the exact queued source before provider admission", async () => {
  const f = await fixture(["trigger", "answer"]);
  const article = {
    id: "verified-knowledge",
    brandId: "main",
    title: "護理資料",
    content: "已核實護理資料。",
    keywords: ["護理"],
    status: "approved",
    validUntil: "2099-12-31",
    revision: 1,
  };
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{studio,articles}',$2::jsonb)where company_id=$1",
    [f.company, JSON.stringify([article])],
  );
  await publish(f);
  await enroll(f);
  await catchup(f);
  assert.equal((await latest(f)).state, "delivery");
  const job = await value<string>(
    "select id v from sv_delivery_jobs where company_id=$1",
    [f.company],
  );
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{studio,articles}',$2::jsonb)where company_id=$1",
    [
      f.company,
      JSON.stringify([{ ...article, content: "更正資料", revision: 2 }]),
    ],
  );
  assert.equal(
    await value(
      "select smartvolt_private.flow_delivery_admit(j)v from sv_delivery_jobs j where j.company_id=$1 and j.id=$2",
      [f.company, job],
    ),
    "knowledge_changed",
  );
});

test("only an actual confirmed exact-thread booking unlocks the Hong Kong reminder wait", async () => {
  const f = await fixture(["trigger", "review", "reminder"]);
  f.flow.nodes[2].config.template =
    "你好 {name}，提醒你 {date} {time} 嘅 {service} 預約。";
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{studio,flows}',$2::jsonb)where company_id=$1",
    [f.company, JSON.stringify([f.flow])],
  );
  await publish(f);
  await enroll(f);
  await catchup(f);
  const run = await latest(f),
    booking = randomUUID();
  await db.query(
    "insert into sv_booking_requests(company_id,id,customer_id,brand_id,provider,thread_id,service,desired_at,guests,status)values($1,$2,$3,'main','whatsapp',$4,'已核實服務',now()+interval'3 days',1,'confirmed')",
    [f.company, booking, f.customer, f.thread],
  );
  await action(f, "continue", {
    flowId: f.flow.id,
    runId: run.id,
    nodeId: "n1",
    bookingId: booking,
  });
  await catchup(f);
  assert.equal((await latest(f)).state, "waiting");
  assert.equal((await latest(f)).reason, "reminder_due");
  assert.equal(
    await value(
      "select count(*)::int v from sv_delivery_jobs where company_id=$1",
      [f.company],
    ),
    0,
  );
  assert.equal(
    await value(
      "select context->>'bookingId'v from sv_flow_runs where company_id=$1",
      [f.company],
    ),
    booking,
  );
});
