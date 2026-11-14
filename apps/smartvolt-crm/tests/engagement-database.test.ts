import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
const db = new PGlite(),
  company = randomUUID(),
  foreign = randomUUID(),
  owner = randomUUID(),
  outsider = randomUUID(),
  agent = randomUUID(),
  connection = randomUUID();
async function value<T = unknown>(
  sql: string,
  args: unknown[] = [],
): Promise<T> {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
const rpc = <T = Record<string, unknown>>(fn: string, args: unknown[]) =>
  value<T>(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})v`, args);
const action = (
  kind: string,
  data: object,
  actor = owner,
  command = randomUUID(),
  tenant = company,
) =>
  rpc("sv_engagement_action", [
    tenant,
    actor,
    command,
    kind,
    JSON.stringify(data),
  ]);
async function customer() {
  const contact = randomUUID(),
    thread = randomUUID();
  await db.query(
    "insert into sv_wa_contacts(id,company_id,display_name)values($1,$2,'Test name')",
    [contact, company],
  );
  await db.query(
    "insert into sv_wa_conversations(id,company_id,connection_id,contact_id,brand_id,remote_id,remote_kind,last_message_at,last_inbound_at)values($1,$2,$3,$4,'main',$5,'bsuid',$6,$6)",
    [thread, company, connection, contact, "synthetic-" + thread, Date.now()],
  );
  const id = await value<string>(
    "select customer_id v from sv_customer_threads where company_id=$1 and thread_id=$2",
    [company, thread],
  );
  return { id, thread };
}
const policy = (extra = {}) =>
  action("policy", {
    marketingEnabled: true,
    quietStart: 0,
    quietEnd: 0,
    frequencyHours: 72,
    dailyLimit: 1000,
    minuteLimit: 100,
    revision: 0,
    ...extra,
  });
const consent = async (id: string, allowed = true, extra = {}) =>
  action("preference", {
    customerId: id,
    brandId: "main",
    channel: "whatsapp",
    purpose: "marketing",
    allowed,
    source: "Synthetic explicit opt-in evidence",
    revision: Number(
      await value(
        "select coalesce((select revision from sv_contact_preferences where company_id=$1 and customer_id=$2 and brand_id='main'and channel='whatsapp'and purpose='marketing'),0)v",
        [company, id],
      ),
    ),
    ...extra,
  });
const campaign = (id: string, extra = {}) => ({
  id: randomUUID(),
  brandId: "main",
  provider: "whatsapp",
  connectionId: connection,
  name: "Synthetic campaign",
  purpose: "marketing",
  definition: { kind: "text", body: "Hello {{name}}", values: [] },
  audience: { customer: id },
  dueAt: new Date().toISOString(),
  ...extra,
});
async function job(source: string) {
  return value<string>(
    "select id v from sv_delivery_jobs where company_id=$1 and source_id=$2",
    [company, source],
  );
}
async function state(id: string) {
  return value<{ state: string; reason: string }>(
    "select jsonb_build_object('state',state,'reason',reason)v from sv_delivery_jobs where company_id=$1 and id=$2",
    [company, id],
  );
}
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,service_role;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  for (const user of [owner, outsider, agent])
    await db.query("insert into auth.users values($1)", [user]);
  await db.exec("set role service_role");
  for (const [id, user] of [
    [company, owner],
    [foreign, outsider],
  ])
    await rpc("sv_provision_company", [
      id,
      "Synthetic",
      user,
      "Owner",
      JSON.stringify(
        createCompanyState({
          companyId: id,
          companyName: "Synthetic",
          brands: [
            { id: "main", name: "Main", short: "M" },
            { id: "other", name: "Other", short: "O" },
          ],
          team: [{ id: user, name: "Owner", initials: "O" }],
        }),
      ),
      ["crm", "pos"],
    ]);
  await db.query(
    "insert into sv_memberships(company_id,user_id,role,display_name,brand_ids,product_ids)values($1,$2,'manager','Scoped',array['other'],array['crm'])",
    [company, agent],
  );
  await db.query(
    "insert into sv_wa_connections(id,company_id,brand_id,app_id,account_id,phone_number_id,encrypted_credentials,verify_token_hash,state,webhook_verified_at)values($1,$2,'main','800001','800002','800003','{\"synthetic\":true}',$3,'active',now())",
    [connection, company, "a".repeat(64)],
  );
  await policy();
});
after(() => db.close());
test("queue snapshots one recipient and renders the actual customer name", async () => {
  const c = await customer();
  await consent(c.id);
  const data = campaign(c.id),
    command = randomUUID();
  const r = await action("campaign", data, owner, command);
  assert.equal(r.recipients, 1);
  assert.deepEqual(await action("campaign", data, owner, command), r);
  assert.equal(
    await value("select count(*)v from sv_delivery_jobs where source_id=$1", [
      data.id,
    ]),
    1,
  );
  const id = await job(data.id);
  assert.equal(
    await value("select payload->>'body'v from sv_delivery_jobs where id=$1", [
      id,
    ]),
    "Hello Test name",
  );
  const claim = await rpc("sv_delivery_claim", [company, id]);
  assert.equal(claim.dispatch, true);
  assert.equal((await rpc("sv_delivery_claim", [company, id])).dispatch, false);
  await rpc("sv_delivery_finish", [
    company,
    id,
    "ambiguous",
    null,
    "delivery_unknown",
  ]);
  assert.equal((await state(id)).state, "unknown");
  assert.equal((await rpc("sv_delivery_claim", [company, id])).dispatch, false);
});
test("missing opt-in skips with a factual recipient reason", async () => {
  const c = await customer(),
    data = campaign(c.id);
  await action("campaign", data);
  const id = await job(data.id);
  assert.equal((await rpc("sv_delivery_claim", [company, id])).dispatch, false);
  assert.equal((await state(id)).reason, "consent_missing");
});
test("withdrawal cancels scheduled jobs and retains immutable consent evidence", async () => {
  const c = await customer();
  await consent(c.id);
  const data = campaign(c.id);
  await action("campaign", data);
  await consent(c.id, false);
  const id = await job(data.id);
  assert.equal((await state(id)).state, "cancelled");
  assert.equal((await rpc("sv_delivery_claim", [company, id])).dispatch, false);
  await assert.rejects(
    db.query(
      "update sv_preference_events set allowed=true where customer_id=$1",
      [c.id],
    ),
    /permission denied|immutable/,
  );
});
test("campaign cancellation does not revoke an already admitted attempt", async () => {
  const c = await customer();
  await consent(c.id);
  const data = campaign(c.id);
  await action("campaign", data);
  const id = await job(data.id);
  await rpc("sv_delivery_claim", [company, id]);
  await action("cancel", { id: data.id });
  assert.equal((await state(id)).state, "dispatching");
});
test("closed reply window blocks free text even with consent", async () => {
  const c = await customer();
  await consent(c.id);
  await db.query(
    "update sv_wa_conversations set last_inbound_at=0 where id=$1",
    [c.thread],
  );
  const data = campaign(c.id);
  await action("campaign", data);
  const id = await job(data.id);
  await rpc("sv_delivery_claim", [company, id]);
  assert.equal((await state(id)).reason, "window_closed");
});
test("fresh current authority is required at send and cached command replay", async () => {
  const c = await customer();
  await consent(c.id);
  await db.query(
    "update sv_memberships set brand_ids=array['main']where company_id=$1 and user_id=$2",
    [company, agent],
  );
  const data = campaign(c.id),
    cmd = randomUUID();
  await action("campaign", data, agent, cmd);
  await db.query(
    "update sv_memberships set brand_ids=array['other']where company_id=$1 and user_id=$2",
    [company, agent],
  );
  await assert.rejects(action("campaign", data, agent, cmd), /brand_scope/);
  const id = await job(data.id);
  await rpc("sv_delivery_claim", [company, id]);
  assert.equal((await state(id)).reason, "authority_changed");
  await assert.rejects(action("campaign", data, outsider), /access_denied/);
});
test("official template must be approved, unchanged and freshly synchronized", async () => {
  const c = await customer();
  await consent(c.id);
  await db.query(
    "update sv_wa_conversations set last_inbound_at=0 where id=$1",
    [c.thread],
  );
  const definition = {
    kind: "template",
    name: "synthetic_offer",
    locale: "en",
    fingerprint: "a".repeat(64),
    body: "Synthetic template",
    values: [],
  };
  const data = campaign(c.id, { definition });
  await action("campaign", data);
  const id = await job(data.id);
  await rpc("sv_delivery_claim", [company, id]);
  assert.equal((await state(id)).reason, "template_changed");
  await rpc("sv_templates_store", [
    company,
    connection,
    JSON.stringify({ synthetic: true }),
    JSON.stringify([
      {
        name: definition.name,
        language: "en",
        fingerprint: definition.fingerprint,
        status: "APPROVED",
        category: "MARKETING",
        supported: true,
      },
    ]),
  ]);
  const next = campaign(c.id, { definition });
  await action("campaign", next);
  assert.equal(
    (await rpc("sv_delivery_claim", [company, await job(next.id)])).dispatch,
    true,
  );
});
test("full results totals are computed before keyset pagination", async () => {
  const r = await rpc<import("../src/lib/engagement/model").EngagementPage>(
    "sv_engagement_read",
    [company, owner, JSON.stringify({})],
  );
  assert.ok(r.campaigns.length >= 6);
  const id = r.campaigns[0].id;
  const result = await rpc<
    import("../src/lib/engagement/model").EngagementPage
  >("sv_engagement_read", [company, owner, JSON.stringify({ campaign: id })]);
  assert.equal(result.resultTotal, 1);
  assert.equal(result.results.length, 1);
  const restricted = await rpc<
    import("../src/lib/engagement/model").EngagementPage
  >("sv_engagement_read", [company, agent, "{}"]);
  assert.equal(restricted.campaigns.length, 0);
  assert.equal(restricted.connections.length, 0);
});
test("scheduler recovers with a new generation and fences an old run", async () => {
  const c = await customer();
  const data = campaign(c.id, {
    dueAt: new Date(Date.now() + 3600000).toISOString(),
  });
  await action("campaign", data);
  const first = await rpc<{
    start: boolean;
    generation: number;
    token: string;
  }>("sv_delivery_scheduler", [company, "wake"]);
  assert.equal(first.start, true);
  const again = await rpc("sv_delivery_scheduler", [company, "wake"]);
  assert.equal(again.start, false);
  await db.query(
    "update sv_delivery_schedulers set lease_until='epoch'where company_id=$1",
    [company],
  );
  const next = await rpc("sv_delivery_scheduler", [company, "wake"]);
  assert.equal(next.generation, first.generation + 1);
  assert.equal(
    (
      await rpc("sv_delivery_scheduler", [
        company,
        "tick",
        first.generation,
        first.token,
      ])
    ).active,
    false,
  );
});
test("browser roles have no raw-table or execution-RPC privileges", async () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(
      await value(
        "select has_table_privilege($1,'sv_delivery_jobs','select')v",
        [role],
      ),
      false,
    );
    assert.equal(
      await value(
        "select has_function_privilege($1,'sv_delivery_claim(uuid,uuid)','execute')v",
        [role],
      ),
      false,
    );
  }
});

const recipe = (kind: string, extra = {}) => ({
  id: randomUUID(),
  brandId: "main",
  provider: "whatsapp",
  connectionId: connection,
  name: "Synthetic journey",
  recipe: kind,
  purpose: "service",
  revision: 0,
  enabled: true,
  steps: [
    {
      delayMinutes: 60,
      definition: {
        kind: "text",
        body: "Service message {{name}}",
        values: [],
      },
    },
  ],
  ...extra,
});
const publish = (data: object) =>
  rpc("sv_journey_action", [
    company,
    owner,
    randomUUID(),
    "publish",
    JSON.stringify(data),
  ]);
async function incoming(
  thread: string,
  at = Date.now(),
  body = "Synthetic reply",
) {
  const id = randomUUID();
  await db.query(
    "insert into sv_wa_messages(id,company_id,connection_id,conversation_id,provider_id,fingerprint,direction,body,message_type,provider_at,author_name,state)values($1,$2,$3,$4,$5,$6,'incoming',$8,'text',$7,'Customer','delivered')",
    [id, company, connection, thread, "wamid." + id, "a".repeat(64), at, body],
  );
  return id;
}
test("real incoming source creates a version-bound journey and another reply replaces old jobs", async () => {
  const c = await customer(),
    r = recipe("unanswered");
  await publish(r);
  await incoming(c.thread);
  const jobs = await db.query<{ id: string; state: string }>(
    "select d.id,d.state from sv_delivery_jobs d join sv_journey_runs r on r.company_id=d.company_id and r.id=d.source_id where r.journey_id=$1 and r.thread_id=$2",
    [r.id, c.thread],
  );
  assert.equal(jobs.rows.length, 1);
  assert.equal(jobs.rows[0].state, "scheduled");
  await incoming(c.thread);
  assert.equal((await state(jobs.rows[0].id)).state, "cancelled");
  assert.equal((await state(jobs.rows[0].id)).reason, "customer_replied");
  const n = await value(
    "select count(*)v from sv_journey_runs where journey_id=$1 and thread_id=$2 and status='active'",
    [r.id, c.thread],
  );
  assert.equal(n, 1);
});
test("inbound STOP cancels marketing and records an opt-out without starting a new chase", async () => {
  const c = await customer();
  await consent(c.id);
  const data = campaign(c.id);
  await action("campaign", data);
  const id = await job(data.id);
  await incoming(c.thread, Date.now(), "STOP");
  assert.equal((await state(id)).state, "cancelled");
  assert.equal(
    await value(
      "select allowed v from sv_contact_preferences where company_id=$1 and customer_id=$2 and purpose='marketing'",
      [company, c.id],
    ),
    false,
  );
  assert.equal(
    await value(
      "select count(*)v from sv_journey_sources where company_id=$1 and thread_id=$2 and active",
      [company, c.thread],
    ),
    0,
  );
});
test("human send admission stops auto-followups while internal notes do not", async () => {
  const c = await customer(),
    r = recipe("unanswered");
  await publish(r);
  await incoming(c.thread);
  const id = await value<string>(
    "select d.id v from sv_delivery_jobs d join sv_journey_runs r on r.id=d.source_id where r.journey_id=$1 and r.thread_id=$2",
    [r.id, c.thread],
  );
  await db.query(
    "insert into sv_wa_messages(company_id,connection_id,conversation_id,fingerprint,direction,body,message_type,provider_at,author_name,state)values($1,$2,$3,$4,'note','Internal note','text',$5,'Staff','accepted')",
    [company, connection, c.thread, "b".repeat(64), Date.now()],
  );
  assert.equal((await state(id)).state, "scheduled");
  await db.query(
    "insert into sv_wa_messages(company_id,connection_id,conversation_id,client_id,fingerprint,direction,body,message_type,provider_at,author_id,author_name,state)values($1,$2,$3,$4,$5,'outgoing','Human response','text',$6,$7,'Staff','dispatching')",
    [
      company,
      connection,
      c.thread,
      randomUUID(),
      "c".repeat(64),
      Date.now(),
      owner,
    ],
  );
  assert.equal((await state(id)).state, "cancelled");
});
test("confirmed appointment edits cancel the obsolete reminder and keep the actual new time", async () => {
  const c = await customer(),
    r = recipe("appointment"),
    booking = randomUUID();
  await publish(r);
  const stamp = new Date(Date.now() + 86400000).toISOString();
  await db.query(
    "insert into sv_booking_requests(company_id,id,customer_id,brand_id,provider,thread_id,service,desired_at,guests,status)values($1,$2,$3,'main','whatsapp',$4,'Actual booking',$5,1,'confirmed')",
    [company, booking, c.id, c.thread, stamp],
  );
  const old = await value<string>(
    "select d.id v from sv_delivery_jobs d join sv_journey_runs r on r.id=d.source_id where r.journey_id=$1 and r.source_key=$2",
    [r.id, "crm-booking:" + booking],
  );
  assert.ok(old);
  await db.query(
    "update sv_booking_requests set desired_at=desired_at+interval '1 day',revision=revision+1 where company_id=$1 and id=$2",
    [company, booking],
  );
  assert.equal((await state(old)).state, "cancelled");
  const pending = await value<string>(
    "select d.due_at::text v from sv_delivery_jobs d join sv_journey_runs r on r.id=d.source_id where r.journey_id=$1 and r.source_key=$2 and d.state='scheduled'",
    [r.id, "crm-booking:" + booking],
  );
  assert.equal(Date.parse(pending), Date.parse(stamp) + 86400000 - 3600000);
  await db.query(
    "update sv_booking_requests set status='cancelled'where company_id=$1 and id=$2",
    [company, booking],
  );
  assert.equal(
    await value(
      "select count(*)v from sv_delivery_jobs d join sv_journey_runs r on r.id=d.source_id where r.journey_id=$1 and r.source_key=$2 and d.state='scheduled'",
      [r.id, "crm-booking:" + booking],
    ),
    0,
  );
});
test("late incoming events do not burst old delays; published versions cannot be rewritten", async () => {
  const c = await customer(),
    r = recipe("unanswered", {
      steps: [
        {
          delayMinutes: 5,
          definition: { kind: "text", body: "Late", values: [] },
        },
      ],
    });
  await publish(r);
  await incoming(c.thread, Date.now() - 7200000);
  assert.equal(
    await value(
      "select count(*)v from sv_journey_runs where journey_id=$1 and thread_id=$2",
      [r.id, c.thread],
    ),
    0,
  );
  await assert.rejects(
    db.query("update sv_journey_versions set steps='[]'where journey_id=$1", [
      r.id,
    ]),
    /permission denied|immutable/,
  );
  await assert.rejects(
    publish(
      recipe("appointment", {
        steps: [
          {
            delayMinutes: 5,
            definition: { kind: "text", body: "A", values: [] },
          },
          {
            delayMinutes: 60,
            definition: { kind: "text", body: "B", values: [] },
          },
        ],
      }),
    ),
    /invalid_delays/,
  );
});

const editor = (
  thread: string,
  token: string,
  mode: string,
  actor = owner,
  revision: number | null = null,
) =>
  rpc<{ held: boolean; occupied: boolean; revision: number }>(
    "sv_editor_action",
    [company, actor, "whatsapp", thread, token, mode, revision],
  );
const humanClaim = (
  thread: string,
  token: string | null,
  actor = owner,
  command = randomUUID(),
  body = "Synthetic human reply",
  revision = 0,
) =>
  rpc<{ dispatch: boolean; message: { id: string } }>("sv_wa_claim_send", [
    company,
    actor,
    thread,
    revision,
    command,
    body,
    null,
    token,
  ]);
test("current editor protects real send admission, takeover retains the old receipt and an unresolved send still blocks", async () => {
  const c = await customer(),
    a = randomUUID(),
    b = randomUUID(),
    command = randomUUID();
  await db.query(
    "update sv_memberships set brand_ids=array['main']where company_id=$1 and user_id=$2",
    [company, agent],
  );
  try {
    const held = await editor(c.thread, a, "acquire");
    assert.equal(held.held, true);
    const blocked = await editor(c.thread, b, "acquire", agent);
    assert.equal(blocked.held, false);
    assert.equal(blocked.occupied, true);
    await assert.rejects(humanClaim(c.thread, null, agent), /editor_conflict/);
    const first = await humanClaim(c.thread, a, owner, command);
    assert.equal(first.dispatch, true);
    const takeover = await editor(
      c.thread,
      b,
      "takeover",
      agent,
      held.revision,
    );
    assert.equal(takeover.held, true);
    assert.equal(
      (await editor(c.thread, b, "takeover", agent, held.revision)).revision,
      takeover.revision,
    );
    assert.equal(
      (await humanClaim(c.thread, a, owner, command)).dispatch,
      false,
    );
    await assert.rejects(
      humanClaim(c.thread, a, owner, randomUUID(), "Retained draft", 1),
      /editor_conflict/,
    );
    await assert.rejects(
      humanClaim(c.thread, b, agent, randomUUID(), "New owner draft", 1),
      /send_unresolved/,
    );
    await rpc("sv_wa_finish_send", [
      company,
      first.message.id,
      "definitive",
      null,
      "synthetic_finish",
    ]);
    const actual = await humanClaim(
      c.thread,
      b,
      agent,
      randomUUID(),
      "New owner reply",
      2,
    );
    assert.equal(actual.dispatch, true);
  } finally {
    await db.query(
      "update sv_memberships set brand_ids=array['other']where company_id=$1 and user_id=$2",
      [company, agent],
    );
  }
});
test("two windows for the same member cannot share a lease; expiry requires reacquisition", async () => {
  const c = await customer(),
    a = randomUUID(),
    b = randomUUID();
  await editor(c.thread, a, "acquire");
  assert.equal((await editor(c.thread, b, "acquire")).held, false);
  await assert.rejects(humanClaim(c.thread, b), /editor_conflict/);
  await db.query(
    "update sv_thread_editors set expires_at='epoch'where company_id=$1 and thread_id=$2",
    [company, c.thread],
  );
  await assert.rejects(humanClaim(c.thread, a), /editor_expired/);
  assert.equal((await editor(c.thread, a, "acquire")).held, true);
  const released = await editor(c.thread, a, "release");
  assert.equal(released.held, false);
  assert.equal(
    (await editor(c.thread, a, "release")).revision,
    released.revision,
  );
});
test("an active human editor prevents an automatic campaign attempt even for its creator", async () => {
  const c = await customer();
  await consent(c.id);
  const t = randomUUID();
  await editor(c.thread, t, "acquire");
  const data = campaign(c.id);
  await action("campaign", data);
  const id = await job(data.id);
  assert.equal((await rpc("sv_delivery_claim", [company, id])).dispatch, false);
  assert.equal((await state(id)).reason, "human_takeover");
  assert.equal(
    await value(
      "select count(*)v from sv_wa_messages where company_id=$1 and conversation_id=$2 and direction='outgoing'",
      [company, c.thread],
    ),
    0,
  );
});
test("a utility template outside the text window requires the exact current editor and service consent", async () => {
  const c = await customer(),
    token = randomUUID();
  await editor(c.thread, token, "acquire");
  await db.query(
    "update sv_wa_conversations set last_inbound_at=0 where id=$1",
    [c.thread],
  );
  await action("preference", {
    customerId: c.id,
    brandId: "main",
    channel: "whatsapp",
    purpose: "service",
    allowed: true,
    source: "Synthetic service consent",
    revision: 0,
  });
  const definition = {
    kind: "template",
    name: "synthetic_service",
    locale: "en",
    fingerprint: "b".repeat(64),
    body: "Confirmed service",
    values: [],
  };
  await rpc("sv_templates_store", [
    company,
    connection,
    JSON.stringify({ synthetic: true }),
    JSON.stringify([
      {
        name: definition.name,
        language: "en",
        fingerprint: definition.fingerprint,
        status: "APPROVED",
        category: "UTILITY",
        supported: true,
      },
    ]),
  ]);
  const data = campaign(c.id, {
    definition,
    purpose: "service",
    editorToken: token,
    threadId: c.thread,
  });
  await action("manual", data);
  const id = await job(data.id);
  assert.equal((await rpc("sv_delivery_claim", [company, id])).dispatch, true);
});

test("working-hour deadlines skip weekends and holidays and preserve real DST duration", async () => {
  const p = {
    timeZone: "Asia/Hong_Kong",
    hoursEnabled: true,
    responseMinutes: 15,
    weekly: [1, 2, 3, 4, 5].map((day) => ({ day, start: 540, end: 1080 })),
    holidays: ["2026-11-16"],
  };
  const from = "2026-11-13T17:55:00+08:00",
    to = "2026-11-17T09:10:00+08:00";
  assert.equal(
    await value("select smartvolt_private.work_minutes($1,$2,$3)::float8 v", [
      from,
      to,
      JSON.stringify(p),
    ]),
    15,
  );
  const due = await value<string>(
    "select smartvolt_private.work_due($1,15,$2)::text v",
    [from, JSON.stringify(p)],
  );
  assert.equal(Date.parse(due), Date.parse(to));
  const dst = {
    ...p,
    timeZone: "America/New_York",
    weekly: [{ day: 7, start: 0, end: 240 }],
    holidays: [],
  };
  assert.equal(
    await value("select smartvolt_private.work_minutes($1,$2,$3)::float8 v", [
      "2026-11-01T00:00:00-04:00",
      "2026-11-01T04:00:00-05:00",
      JSON.stringify(dst),
    ]),
    300,
  );
});
test("supervision measures actual accepted human replies, ignores notes, and freezes office-hour policy", async () => {
  const c = await customer();
  await incoming(c.thread);
  const p = await value<{
    policy: { responseMinutes: number };
    response_due_at: string;
  }>(
    "select jsonb_build_object('policy',policy,'response_due_at',response_due_at)v from sv_sla_episodes where company_id=$1 and thread_id=$2 order by started_at desc limit 1",
    [company, c.thread],
  );
  const newPolicy = (await value(
    "select smartvolt_private.sla_default()v",
  )) as Record<string, unknown>;
  await rpc("sv_sla_policy_action", [
    company,
    owner,
    randomUUID(),
    "main",
    0,
    JSON.stringify({ ...newPolicy, responseMinutes: 90 }),
  ]);
  assert.equal(
    await value(
      "select (policy->>'responseMinutes')::integer v from sv_sla_episodes where company_id=$1 and thread_id=$2",
      [company, c.thread],
    ),
    p.policy.responseMinutes,
  );
  await db.query(
    "insert into sv_wa_messages(company_id,connection_id,conversation_id,fingerprint,direction,body,message_type,provider_at,author_id,author_name,state)values($1,$2,$3,$4,'note','Note','text',$5,$6,'Owner','accepted')",
    [company, connection, c.thread, "c".repeat(64), Date.now(), owner],
  );
  assert.equal(
    await value(
      "select first_human_at is null v from sv_sla_episodes where company_id=$1 and thread_id=$2",
      [company, c.thread],
    ),
    true,
  );
  await db.query(
    "insert into sv_wa_messages(company_id,connection_id,conversation_id,client_id,fingerprint,direction,body,message_type,provider_at,author_id,author_name,state)values($1,$2,$3,$4,$5,'outgoing','Human','text',$6,$7,'Owner','accepted')",
    [
      company,
      connection,
      c.thread,
      randomUUID(),
      "d".repeat(64),
      Date.now(),
      owner,
    ],
  );
  assert.equal(
    await value(
      "select first_human_at is not null and human_actor=$3 v from sv_sla_episodes where company_id=$1 and thread_id=$2",
      [company, c.thread, owner],
    ),
    true,
  );
  await incoming(c.thread);
  assert.equal(
    await value(
      "select count(*)v from sv_sla_episodes where company_id=$1 and thread_id=$2",
      [company, c.thread],
    ),
    2,
  );
  assert.equal(
    await value(
      "select (policy->>'responseMinutes')::integer v from sv_sla_episodes where company_id=$1 and thread_id=$2 order by started_at desc limit 1",
      [company, c.thread],
    ),
    90,
  );
  const r = await rpc<{
    metrics: { pending: number };
    queue: unknown[];
    coverageFrom: string;
  }>("sv_supervision_read", [
    company,
    owner,
    "main",
    null,
    null,
    "2026-01-01",
    "2026-12-31",
  ]);
  assert.ok(r.metrics.pending > 0);
  assert.ok(r.coverageFrom);
  assert.ok(r.queue.length);
  const restricted = await rpc<{
    queue: unknown[];
    metrics: { pending: number };
  }>("sv_supervision_read", [
    company,
    agent,
    "other",
    null,
    null,
    "2026-01-01",
    "2026-12-31",
  ]);
  assert.equal(restricted.metrics.pending, 0);
  assert.equal(restricted.queue.length, 0);
  await assert.rejects(
    rpc("sv_supervision_read", [
      company,
      agent,
      "main",
      null,
      null,
      "2026-01-01",
      "2026-12-31",
    ]),
    /brand_scope/,
  );
});

test("literal merge fields use actual source facts once and missing facts never invent a reminder", async () => {
  const p = {
    kind: "text",
    body: "{{name}} · {{date}} {{time}} · {{service}} · {{brand}}",
    values: [],
  };
  const context = {
    date: "2026-12-02",
    time: "14:30",
    service: "Verified service",
    brand: "Main",
  };
  assert.equal(
    (
      await rpc<{ body: string }>("smartvolt_private.delivery_render", [
        JSON.stringify(p),
        "{{service}}",
        JSON.stringify(context),
      ])
    ).body,
    "{{service}} · 2026-12-02 14:30 · Verified service · Main",
  );
  assert.equal(
    await rpc("smartvolt_private.delivery_render", [
      JSON.stringify(p),
      "Customer",
      "{}",
    ]),
    null,
  );
  const c = await customer(),
    r = recipe("appointment", { steps: [{ delayMinutes: 60, definition: p }] });
  await publish(r);
  const booking = randomUUID(),
    at = new Date(Date.now() + 3 * 86400000).toISOString();
  await db.query(
    "insert into sv_booking_requests(company_id,id,customer_id,brand_id,provider,thread_id,service,desired_at,guests,status)values($1,$2,$3,'main','whatsapp',$4,'Real service',$5,1,'confirmed')",
    [company, booking, c.id, c.thread, at],
  );
  const source = await value<{ context: { service: string } }>(
    "select to_jsonb(s)v from sv_journey_sources s where company_id=$1 and source_key=$2",
    [company, "crm-booking:" + booking],
  );
  assert.equal(source.context.service, "Real service");
  await db.query(
    "update sv_booking_requests set service='Changed service',revision=revision+1 where company_id=$1 and id=$2",
    [company, booking],
  );
  assert.ok(
    (
      await value<string>(
        "select payload->>'body'v from sv_delivery_jobs j join sv_journey_runs r on r.company_id=j.company_id and r.id=j.source_id where j.company_id=$1 and r.journey_id=$2 and r.source_key=$3 and j.state='scheduled'",
        [company, r.id, "crm-booking:" + booking],
      )
    ).includes("Changed service"),
  );
  assert.ok(Number(await rpc("sv_journey_catchup", [company])) >= 0);
});
test("roster applies stable branch, skills, actual shift and leave independently of capacity", async () => {
  const c = await customer(),
    branch = randomUUID();
  const act = (kind: string, data: object) =>
    rpc("sv_roster_action", [
      company,
      owner,
      randomUUID(),
      kind,
      JSON.stringify(data),
    ]);
  await act("branch", {
    id: branch,
    name: "Test branch",
    active: true,
    revision: 0,
  });
  await act("requirement", {
    provider: "whatsapp",
    threadId: c.thread,
    branchId: branch,
    skills: ["English"],
    revision: 0,
  });
  assert.equal(
    await rpc("smartvolt_private.roster_eligible", [
      company,
      owner,
      "whatsapp",
      c.thread,
      "2026-11-16T10:00:00+08:00",
    ]),
    false,
  );
  const profile = {
    userId: owner,
    branchIds: [branch],
    skills: ["English"],
    timeZone: "Asia/Hong_Kong",
    rosterEnabled: true,
    weekly: [{ day: 1, start: 540, end: 1080 }],
    leavePeriods: [],
    revision: 0,
  };
  await act("member", profile);
  assert.equal(
    await rpc("smartvolt_private.roster_eligible", [
      company,
      owner,
      "whatsapp",
      c.thread,
      "2026-11-16T10:00:00+08:00",
    ]),
    true,
  );
  assert.equal(
    await rpc("smartvolt_private.roster_eligible", [
      company,
      owner,
      "whatsapp",
      c.thread,
      "2026-11-16T19:00:00+08:00",
    ]),
    false,
  );
  await act("member", {
    ...profile,
    leavePeriods: [
      { from: "2026-11-16T09:00:00+08:00", to: "2026-11-16T12:00:00+08:00" },
    ],
    revision: 1,
  });
  assert.equal(
    await rpc("smartvolt_private.roster_eligible", [
      company,
      owner,
      "whatsapp",
      c.thread,
      "2026-11-16T10:00:00+08:00",
    ]),
    false,
  );
  const scoped = await rpc<{ branches: unknown[] }>("sv_roster_read", [
    company,
    owner,
    null,
    null,
  ]);
  assert.equal(scoped.branches.length, 1);
  await assert.rejects(
    rpc("sv_roster_read", [company, agent, null, null]),
    /access_denied/,
  );
  await assert.rejects(
    rpc("sv_roster_action", [
      company,
      agent,
      randomUUID(),
      "branch",
      JSON.stringify({
        id: randomUUID(),
        name: "Denied",
        active: true,
        revision: 0,
      }),
    ]),
    /brand_scope/,
  );
});

test("notification feed deduplicates facts, snoozes and finishes reminders independently of source tasks", async () => {
  const c = await customer(),
    id = randomUUID();
  await db.query(
    "insert into sv_followup_tasks(company_id,id,customer_id,brand_id,provider,thread_id,title,due_at,owner_id,source_key)values($1,$2,$3,'main','whatsapp',$4,'Real due follow-up',now()-interval '1 hour',$5,$6)",
    [company, id, c.id, c.thread, owner, "synthetic:" + id],
  );
  const read = () =>
    rpc<{
      rows: { id: string; title: string; revision: number }[];
      total: number;
    }>("sv_notification_read", [company, owner]);
  const first = await read(),
    n = first.rows.find((n) => n.title === "Real due follow-up")!;
  assert.ok(n);
  assert.equal((await read()).total, first.total);
  const cmd = randomUUID(),
    data = {
      id: n.id,
      revision: n.revision,
      until: new Date(Date.now() + 3600000).toISOString(),
    };
  await rpc("sv_notification_action", [
    company,
    owner,
    cmd,
    "snooze",
    JSON.stringify(data),
  ]);
  await rpc("sv_notification_action", [
    company,
    owner,
    cmd,
    "snooze",
    JSON.stringify(data),
  ]);
  assert.equal(
    (await read()).rows.some((x) => x.id === n.id),
    false,
  );
  await rpc("sv_notification_action", [
    company,
    owner,
    randomUUID(),
    "done",
    JSON.stringify({ id: n.id, revision: n.revision + 1 }),
  ]);
  assert.equal(
    await value(
      "select status v from sv_followup_tasks where company_id=$1 and id=$2",
      [company, id],
    ),
    "open",
  );
  await assert.rejects(
    rpc("sv_notification_action", [
      company,
      outsider,
      randomUUID(),
      "done",
      JSON.stringify({ id: n.id, revision: 1 }),
    ]),
    /access_denied/,
  );
});
test("push admission checks current facts and device ownership and never retries an unknown attempt", async () => {
  const c = await customer(),
    id = randomUUID();
  await db.query(
    "insert into sv_followup_tasks(company_id,id,customer_id,brand_id,provider,thread_id,title,due_at,owner_id,source_key)values($1,$2,$3,'main','whatsapp',$4,'Push fixture',now(),$5,$6)",
    [company, id, c.id, c.thread, owner, "push:" + id],
  );
  await rpc("sv_notification_sync", [company, owner]);
  await rpc("sv_notification_action", [
    company,
    owner,
    randomUUID(),
    "preferences",
    JSON.stringify({
      revision: 0,
      data: {
        assignment: true,
        followup: true,
        sla: true,
        push: true,
        quietStart: 0,
        quietEnd: 0,
      },
    }),
  ]);
  await rpc("sv_notification_action", [
    company,
    owner,
    randomUUID(),
    "device",
    JSON.stringify({
      endpoint: "https://fcm.googleapis.com/synthetic-only/" + randomUUID(),
      p256dh: "synthetic",
      auth: "synthetic",
      label: "Synthetic",
    }),
  ]);
  const first = await rpc<{ notificationId: string; deviceId: string }[]>(
    "sv_push_claim",
    [company, owner],
  );
  assert.ok(first.length);
  assert.equal(
    (await rpc<unknown[]>("sv_push_claim", [company, owner])).length,
    0,
  );
  const a = first[0];
  await rpc("sv_push_finish", [
    company,
    owner,
    a.notificationId,
    a.deviceId,
    "unknown",
    "synthetic_unknown",
    false,
  ]);
  assert.equal(
    (await rpc<unknown[]>("sv_push_claim", [company, owner])).length,
    0,
  );
  await rpc("sv_notification_action", [
    company,
    owner,
    randomUUID(),
    "revoke",
    JSON.stringify({ id: a.deviceId }),
  ]);
  assert.equal(
    await value(
      "select active v from sv_push_devices where company_id=$1 and id=$2",
      [company, a.deviceId],
    ),
    false,
  );
});
test("own-site handoff preserves source IDs, excludes tests and does not overwrite edited customers or infer channel consent", async () => {
  await db.exec(
    "reset role;create schema website_private;create table website_private.intake_settings(singleton boolean,company_id uuid,active boolean);create table website_private.enquiries(id uuid,company_id uuid,name text,phone text,email text,reference text,message text,interest text,consent_version text,marketing_consent boolean,created_at timestamptz,revision bigint,is_test boolean);grant usage on schema website_private to service_role;grant all on all tables in schema website_private to service_role;create trigger synthetic_intake after insert or update on website_private.enquiries for each row execute function smartvolt_private.sales_trigger();set role service_role;",
  );
  await db.query(
    "insert into website_private.intake_settings values(true,$1,true)",
    [company],
  );
  const id = randomUUID();
  for (const isTest of [false, true])
    await db.query(
      "insert into website_private.enquiries values($1,$2,'Web customer','+85260000001','synthetic@example.invalid',$3,'Actual enquiry','crm','fixture-v1',true,now(),1,$4)",
      [isTest ? randomUUID() : id, company, "CV-" + randomUUID(), isTest],
    );
  await rpc("sv_sales_action", [
    company,
    owner,
    randomUUID(),
    "setting",
    JSON.stringify({ brandId: "main", enabled: true, revision: 0 }),
  ]);
  assert.equal(
    await value(
      "select count(*)v from sv_sales_enquiries where company_id=$1",
      [company],
    ),
    1,
  );
  await db.query(
    "update sv_customers set name='Manually edited'where company_id=$1 and id=$2",
    [company, "website:" + id],
  );
  await rpc("sv_sales_catchup", [company]);
  assert.equal(
    await value(
      "select name v from sv_customers where company_id=$1 and id=$2",
      [company, "website:" + id],
    ),
    "Manually edited",
  );
  assert.equal(
    await value(
      "select count(*)v from sv_contact_preferences where company_id=$1 and customer_id=$2",
      [company, "website:" + id],
    ),
    0,
  );
  assert.equal(
    await value(
      "select count(*)v from sv_customer_threads where company_id=$1 and customer_id=$2",
      [company, "website:" + id],
    ),
    0,
  );
  const denied = await rpc<{ rows: unknown[] }>("sv_sales_read", [
    company,
    agent,
  ]);
  assert.equal(denied.rows.length, 0);
});

test("reports use the complete scoped source before pagination and hide POS money from CRM-only managers", async () => {
  const c = await customer(),
    booking = randomUUID(),
    at = new Date(Date.now() + 86400000).toISOString();
  await db.query(
    "insert into sv_booking_requests(company_id,id,customer_id,brand_id,provider,thread_id,service,desired_at,guests,status)values($1,$2,$3,'main','whatsapp',$4,'Verified service',$5,1,'confirmed')",
    [company, booking, c.id, c.thread, at],
  );
  const read = (actor: string, brand: string | null = null) =>
    rpc<{
      metrics: {
        inquiries: number;
        confirmed: number;
        receiptsCents: number | null;
      };
      campaigns: unknown[];
      hasPos: boolean;
    }>("sv_reports_read", [
      company,
      actor,
      "2026-11-01",
      "2026-12-01",
      new Date().toISOString(),
      brand,
      "period",
      null,
      null,
    ]);
  const r = await read(owner);
  assert.ok(r.metrics.inquiries > 10);
  assert.ok(r.metrics.confirmed > 0);
  assert.equal(r.hasPos, true);
  assert.equal(r.metrics.receiptsCents, 0);
  const scoped = await read(agent, "other");
  assert.equal(scoped.metrics.inquiries, 0);
  assert.equal(scoped.metrics.receiptsCents, null);
  await db.query(
    "update sv_memberships set brand_ids=array['main']where company_id=$1 and user_id=$2",
    [company, agent],
  );
  const crm = await read(agent, "main");
  assert.equal(crm.hasPos, false);
  assert.ok(crm.metrics.confirmed > 0);
  assert.equal(crm.metrics.receiptsCents, null);
  await db.query(
    "update sv_memberships set brand_ids=array['other']where company_id=$1 and user_id=$2",
    [company, agent],
  );
  await assert.rejects(
    db.query(
      "update sv_business_outcomes set occurred_at=now()where company_id=$1",
      [company],
    ),
    /permission denied|immutable/,
  );
});

test("feedback requires specific measurement evidence and current source and fences accepted/unknown sends", async () => {
  const c = await customer();
  await db.query(
    "update sv_customers set phone='+85260000001'where company_id=$1 and id=$2",
    [company, c.id],
  );
  await rpc("sv_feedback_action", [
    company,
    owner,
    randomUUID(),
    "setting",
    JSON.stringify({
      brandId: "main",
      datasetId: "11111",
      businessId: "22222",
      adAccountId: "33333",
      label: "Synthetic",
      credentials: { synthetic: true },
      enabled: true,
      mode: "test",
      testCode: "SYNTHETIC",
      revision: 0,
    }),
  ]);
  const booking = randomUUID();
  await db.query(
    "insert into sv_booking_requests(company_id,id,customer_id,brand_id,provider,thread_id,service,desired_at,guests,status)values($1,$2,$3,'main','whatsapp',$4,'Verified',$5,1,'confirmed')",
    [
      company,
      booking,
      c.id,
      c.thread,
      new Date(Date.now() + 86400000).toISOString(),
    ],
  );
  await rpc("sv_feedback_prepare", [company]);
  assert.equal(
    await value("select count(*)v from sv_feedback_jobs where company_id=$1", [
      company,
    ]),
    0,
  );
  await rpc("sv_feedback_action", [
    company,
    owner,
    randomUUID(),
    "consent",
    JSON.stringify({
      brandId: "main",
      customerId: c.id,
      allowed: true,
      consentedAt: new Date(Date.now() - 60000).toISOString(),
      source: "Synthetic recorded measurement opt-in",
      revision: 0,
    }),
  ]);
  await rpc("sv_feedback_prepare", [company]);
  const id = await value<string>(
    "select id v from sv_feedback_jobs where company_id=$1",
    [company],
  );
  assert.ok(id);
  const first = await rpc("sv_feedback_claim", [company, id, 1]);
  assert.equal(first.dispatch, true);
  assert.equal(first.eventName, "Schedule");
  assert.equal(
    (await rpc("sv_feedback_claim", [company, id, 1])).dispatch,
    false,
  );
  await rpc("sv_feedback_finish", [
    company,
    id,
    "unknown",
    "synthetic_timeout",
    "{}",
  ]);
  await rpc("sv_feedback_prepare", [company]);
  assert.equal(
    (await rpc("sv_feedback_claim", [company, id, 1])).dispatch,
    false,
  );
  assert.equal(
    await value("select count(*)v from sv_feedback_jobs where company_id=$1", [
      company,
    ]),
    1,
  );
  const read = await rpc<{ settings: unknown[]; jobs: unknown[] }>(
    "sv_feedback_read",
    [company, agent],
  );
  assert.equal(read.settings.length, 0);
  assert.equal(read.jobs.length, 0);
  await assert.rejects(
    rpc("sv_feedback_receipt", [
      company,
      outsider,
      randomUUID(),
      JSON.stringify({ brandId: "main" }),
    ]),
    /access_denied/,
  );
});

test("verified partial receipts, full payment and refunds remain separate from booking status", async () => {
  const c = await customer(),
    order = "order-" + randomUUID(),
    payment = (amount: number) =>
      db.query(
        "insert into sv_pos_payments(company_id,id,order_id,amount_cents,method,reference,occurred_at,actor,source,workspace_revision,snapshot)values($1,$2,$3,$4,'cash','',$5,'Synthetic','manual_verified',1,'{}')",
        [company, "receipt-" + randomUUID(), order, amount, Date.now()],
      );
  await db.query(
    "insert into sv_pos_orders(company_id,id,number,brand_id,contact_id,subtotal_cents,discount_cents,total_cents,voided,created_at,workspace_revision,snapshot)values($1,$2,$2,'main',$3,10000,0,10000,false,$4,1,'{}')",
    [company, order, c.id, Date.now()],
  );
  await payment(7000);
  assert.equal(
    await value(
      "select count(*)v from sv_business_outcomes where company_id=$1 and source_key=$2 and kind='purchase'",
      [company, "purchase:" + order],
    ),
    0,
  );
  await payment(3000);
  assert.equal(
    await value(
      "select count(*)v from sv_business_outcomes where company_id=$1 and source_key=$2 and kind='purchase'",
      [company, "purchase:" + order],
    ),
    1,
  );
  await db.query(
    "insert into sv_pos_refunds(company_id,id,order_id,amount_cents,reason,occurred_at,actor,source,workspace_revision,snapshot)values($1,$2,$3,2000,'Verified refund',$4,'Synthetic','manual_verified',2,'{}')",
    [company, "refund-" + randomUUID(), order, Date.now()],
  );
  const r = await rpc<{
    metrics: { receiptsCents: number; refundsCents: number };
  }>("sv_reports_read", [
    company,
    owner,
    "2026-11-01",
    "2026-12-01",
    new Date().toISOString(),
    "main",
    "period",
  ]);
  assert.equal(r.metrics.receiptsCents, 10000);
  assert.equal(r.metrics.refundsCents, 2000);
  const before = await rpc<{ metrics: { receiptsCents: number } }>(
    "sv_reports_read",
    [
      company,
      owner,
      "2026-11-01",
      "2026-12-01",
      "2026-11-01T00:00:00Z",
      "main",
      "period",
    ],
  );
  assert.equal(before.metrics.receiptsCents, 0);
});
test("report campaign paging cannot change whole totals or repeat the previous page", async () => {
  await db.query(
    "insert into sv_campaigns(company_id,id,brand_id,connection_id,provider,channel,name,purpose,definition,audience,due_at,created_by,created_at)select $1,gen_random_uuid(),'main',$2,'whatsapp','whatsapp','Synthetic page '||s,'marketing','{}','{}',now(),$3,now()+make_interval(secs=>s)from generate_series(1,73)s",
    [company, connection, owner],
  );
  const read = (before: string | null = null, id: string | null = null) =>
    rpc<{
      campaignTotal: number;
      campaigns: { id: string; created_at: string }[];
      metrics: { inquiries: number };
    }>("sv_reports_read", [
      company,
      owner,
      "2026-11-01",
      "2026-12-01",
      new Date().toISOString(),
      "main",
      "period",
      before,
      id,
    ]);
  const one = await read();
  assert.ok(one.campaignTotal >= 73);
  assert.equal(one.campaigns.length, 31);
  const last = one.campaigns[29],
    two = await read(last.created_at, last.id);
  assert.equal(two.campaignTotal, one.campaignTotal);
  assert.equal(two.metrics.inquiries, one.metrics.inquiries);
  assert.equal(
    two.campaigns.some((x) =>
      one.campaigns.slice(0, 30).some((y) => y.id === x.id),
    ),
    false,
  );
});

test("first-record revisions reject another writer's stale empty-form submission", async () => {
  const c = await customer();
  await consent(c.id);
  await assert.rejects(
    action("preference", {
      customerId: c.id,
      brandId: "main",
      channel: "whatsapp",
      purpose: "marketing",
      allowed: false,
      source: "Synthetic stale form",
      revision: 0,
    }),
    /revision_conflict/,
  );
  const id = randomUUID(),
    branch = { id, name: "First saved name", active: true, revision: 0 };
  await rpc("sv_roster_action", [
    company,
    owner,
    randomUUID(),
    "branch",
    JSON.stringify(branch),
  ]);
  await assert.rejects(
    rpc("sv_roster_action", [
      company,
      owner,
      randomUUID(),
      "branch",
      JSON.stringify({ ...branch, name: "Stale competing form" }),
    ]),
    /revision_conflict/,
  );
  assert.equal(
    await value(
      "select name v from sv_routing_branches where company_id=$1 and id=$2",
      [company, id],
    ),
    "First saved name",
  );
});

test("company stop switch cancels pending automation, blocks new campaigns and retains cancellation after resume", async () => {
  const c = await customer();
  await consent(c.id);
  const data = campaign(c.id);
  await action("campaign", data);
  const id = await job(data.id),
    revision = Number(
      await value(
        "select revision v from sv_delivery_policies where company_id=$1",
        [company],
      ),
    );
  await policy({ executionPaused: true, revision });
  assert.equal((await state(id)).state, "cancelled");
  assert.equal((await state(id)).reason, "execution_paused");
  assert.equal((await rpc("sv_delivery_claim", [company, id])).dispatch, false);
  await assert.rejects(action("campaign", campaign(c.id)), /execution_paused/);
  await policy({ executionPaused: false, revision: revision + 1 });
  assert.equal((await state(id)).state, "cancelled");
});

test("background C observations retain sources, dedupe, quiet feedback and current brand scope without AI", async () => {
  const before = await value<number>(
    "select count(*)::integer v from sv_ai_requests where company_id=$1",
    [company],
  );
  const checked = new Date().toISOString();
  const observation = {
    key: "reactivation:synthetic-background",
    feedbackKey: "reactivation:live-c-key",
    family: "reactivation",
    subject: "company",
    title: "Synthetic sourced observation",
    detail: "Only current scoped records",
    evidence: ["Synthetic source count: 2"],
    facts: [
      {
        id: "dormant",
        label: "Source",
        value: "2",
        source: "Synthetic formal records",
      },
    ],
  };
  const context = await rpc<{ brands: string[] }>(
    "sv_copilot_background_context",
    [company, agent],
  );
  assert.deepEqual(context.brands, ["other"]);
  await assert.rejects(
    rpc("sv_copilot_background_record", [
      company,
      agent,
      "main",
      checked,
      JSON.stringify([observation]),
    ]),
    /brand_scope/,
  );
  const record = (rows: unknown[], at = checked) =>
    rpc("sv_copilot_background_record", [
      company,
      owner,
      "main",
      at,
      JSON.stringify(rows),
    ]);
  await record([observation]);
  await record([observation]);
  assert.equal(
    await value(
      "select count(*)::integer v from sv_notifications where company_id=$1 and user_id=$2 and source_key=$3",
      [company, owner, "observation:main:" + observation.key],
    ),
    1,
  );
  const page = await rpc<{ rows: { kind: string; evidence: unknown }[] }>(
    "sv_notification_read",
    [company, owner],
  );
  assert.ok(
    page.rows.some(
      (n) =>
        n.kind === "observation" &&
        JSON.stringify(n.evidence).includes("Synthetic formal records"),
    ),
  );
  await db.query(
    "insert into sv_copilot_feedback(company_id,actor_id,signal_key,family,subject,status,until)values($1,$2,$3,'other','other','snoozed',now()+interval '1 hour')",
    [company, owner, observation.feedbackKey],
  );
  assert.equal(
    await value(
      "select count(*)::integer v from smartvolt_private.notification_candidates($1,$2)where kind='observation'",
      [company, owner],
    ),
    0,
  );
  await db.query(
    "update sv_copilot_feedback set until=now()-interval '1 second'where company_id=$1 and actor_id=$2 and signal_key=$3",
    [company, owner, observation.feedbackKey],
  );
  const newer = new Date(Date.now() + 1000).toISOString();
  await record([], newer);
  await record([observation]);
  assert.equal(
    await value(
      "select count(*)::integer v from sv_copilot_background where company_id=$1 and user_id=$2 and active",
      [company, owner],
    ),
    0,
    "an older worker cannot revive an observation removed by a newer empty snapshot",
  );
  await assert.rejects(
    record([observation], new Date(Date.now() - 180000).toISOString()),
    /stale_observation/,
  );
  assert.equal(
    await value(
      "select count(*)::integer v from sv_ai_requests where company_id=$1",
      [company],
    ),
    before,
  );
});
