import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
import {
  segmentActionSchema,
  type SegmentsPage,
  type SegmentPreview,
} from "../src/lib/segments/model";
const db = new PGlite(),
  owner = randomUUID(),
  viewer = randomUUID(),
  manager = randomUUID(),
  outsider = randomUUID();
async function value<T = unknown>(
  sql: string,
  args: unknown[] = [],
): Promise<T> {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
const rpc = <T = Record<string, unknown>>(fn: string, args: unknown[]) =>
  value<T>(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})v`, args);
async function fixture() {
  const company = randomUUID(),
    connection = randomUUID();
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
    "insert into sv_memberships(company_id,user_id,role,display_name,brand_ids,product_ids)values($1,$2,'viewer','Viewer',null,null),($1,$3,'manager','Scoped',array['other'],array['crm'])",
    [company, viewer, manager],
  );
  await db.query(
    "insert into sv_wa_connections(id,company_id,brand_id,app_id,account_id,phone_number_id,encrypted_credentials,verify_token_hash,state,webhook_verified_at)values($1,$2,'main',$4,$5,$6,'{\"synthetic\":true}',$3,'active',now())",
    [
      connection,
      company,
      "a".repeat(64),
      BigInt("0x" + connection.replaceAll("-", "").slice(0, 12)).toString(),
      BigInt("0x" + connection.replaceAll("-", "").slice(0, 12)).toString(),
      BigInt("0x" + connection.replaceAll("-", "").slice(0, 12)).toString(),
    ],
  );
  return { company, connection };
}
async function customer(f: Awaited<ReturnType<typeof fixture>>, days = 0) {
  const contact = randomUUID(),
    thread = randomUUID();
  await db.query(
    "insert into sv_wa_contacts(id,company_id,display_name)values($1,$2,'Synthetic customer')",
    [contact, f.company],
  );
  await db.query(
    "insert into sv_wa_conversations(id,company_id,connection_id,contact_id,brand_id,remote_id,remote_kind,last_message_at,last_inbound_at)values($1,$2,$3,$4,'main',$5,'bsuid',$6,$6)",
    [
      thread,
      f.company,
      f.connection,
      contact,
      "synthetic-" + thread,
      Date.now() - days * 86400000,
    ],
  );
  return {
    id: await value<string>(
      "select customer_id v from sv_customer_threads where company_id=$1 and thread_id=$2",
      [f.company, thread],
    ),
    thread,
  };
}
const data = (extra = {}) => ({
  commandId: randomUUID(),
  id: randomUUID(),
  brandId: "main",
  name: "Synthetic segment",
  mode: "all",
  rules: [{ kind: "tag", value: "interested" }],
  includePos: false,
  enabled: true,
  revision: 0,
  ...extra,
});
const act = (company: string, kind: string, d: object, actor = owner) =>
  rpc("sv_segment_action", [company, actor, kind, JSON.stringify(d)]);
const read = (company: string, id?: string, actor = owner) =>
  rpc<SegmentsPage & { selected: NonNullable<SegmentsPage["selected"]> }>(
    "sv_segments_read",
    [
      company,
      actor,
      JSON.stringify({ brandId: "main", ...(id ? { segmentId: id } : {}) }),
    ],
  );
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to service_role,authenticated;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  for (const actor of [owner, viewer, manager, outsider])
    await db.query("insert into auth.users values($1)", [actor]);
  await db.exec("set role service_role");
});
after(() => db.close());
test("customer tag edits automatically enter and exit, with immutable membership events", async () => {
  const f = await fixture(),
    c = await customer(f),
    d = data();
  await act(f.company, "upsert", d);
  assert.equal((await read(f.company, d.id)).selected.count, 0);
  await db.query(
    "update sv_customers set tags='[\"interested\"]',revision=revision+1 where company_id=$1 and id=$2",
    [f.company, c.id],
  );
  let page = await read(f.company, d.id);
  assert.equal(page.selected.count, 1);
  assert.equal(page.selected.events[0].kind, "entered");
  await db.query(
    "update sv_customers set tags='[]',revision=revision+1 where company_id=$1 and id=$2",
    [f.company, c.id],
  );
  page = await read(f.company, d.id);
  assert.equal(page.selected.count, 0);
  assert.deepEqual(
    page.selected.events.map((e) => e.kind),
    ["exited", "entered"],
  );
  await assert.rejects(
    db.query("update sv_segment_events set reason=$1 where company_id=$2", [
      "rewritten",
      f.company,
    ]),
  );
});
test("rule revisions and ambiguous retries are immutable command receipts", async () => {
  const f = await fixture(),
    d = data();
  const first = await act(f.company, "upsert", d);
  assert.deepEqual(await act(f.company, "upsert", d), first);
  assert.equal(
    await value(
      "select count(*)v from sv_dynamic_segments where company_id=$1",
      [f.company],
    ),
    1,
  );
  await assert.rejects(
    act(f.company, "upsert", { ...d, name: "different" }),
    /idempotency_conflict/,
  );
  await assert.rejects(
    act(f.company, "upsert", { ...d, commandId: randomUUID(), revision: 0 }),
    /revision_conflict/,
  );
  await act(f.company, "upsert", {
    ...d,
    commandId: randomUUID(),
    revision: 1,
    name: "Updated",
  });
  assert.equal((await read(f.company, d.id)).selected.revision, 2);
});
test("time-only catchup and exact 24-hour boundaries do not invent a last inbound", async () => {
  const f = await fixture(),
    c = await customer(f, 2),
    d = data({ rules: [{ kind: "inactive", days: 1 }] });
  await act(f.company, "upsert", d);
  assert.equal((await read(f.company, d.id)).selected.count, 1);
  await db.query(
    "update sv_wa_conversations set last_inbound_at=$1 where company_id=$2 and id=$3",
    [Date.now(), f.company, c.thread],
  );
  assert.equal((await read(f.company, d.id)).selected.count, 0);
  await db.query(
    "select smartvolt_private.segment_refresh($1,$2,statement_timestamp()+interval '2 days',null,'scheduled_refresh')",
    [f.company, d.id],
  );
  assert.equal((await read(f.company, d.id)).selected.count, 1);
  const at = "2026-11-15T00:00:00+08:00",
    facts = JSON.stringify({ lastInbound: "2026-11-14T00:00:00+08:00" });
  assert.equal(
    await rpc("smartvolt_private.segment_matches", [
      "all",
      JSON.stringify([{ kind: "inactive", days: 1 }]),
      facts,
      at,
    ]),
    true,
  );
  assert.equal(
    await rpc("smartvolt_private.segment_matches", [
      "all",
      JSON.stringify([{ kind: "recent_inbound", days: 1 }]),
      facts,
      at,
    ]),
    false,
  );
  assert.equal(
    await rpc("smartvolt_private.segment_matches", [
      "all",
      JSON.stringify([{ kind: "inactive", days: 1 }]),
      JSON.stringify({ lastInbound: null }),
      at,
    ]),
    false,
  );
});
test("full all/any evaluation and stage/channel source predicates precede preview sampling", async () => {
  const f = await fixture(),
    c = await customer(f);
  await db.query(
    "update sv_customers set tags='[\"interested\"]'where company_id=$1 and id=$2",
    [f.company, c.id],
  );
  const d = data({
    rules: [
      { kind: "tag", value: "missing" },
      { kind: "channel", value: "whatsapp" },
    ],
    mode: "any",
  });
  const r = (await act(f.company, "preview", d)) as unknown as SegmentPreview;
  assert.equal(r.preview.total, 1);
  assert.equal(
    (
      (await act(f.company, "preview", {
        ...d,
        mode: "all",
      })) as unknown as SegmentPreview
    ).preview.total,
    0,
  );
  assert.equal(
    await value(
      "select count(*)v from sv_dynamic_segments where company_id=$1",
      [f.company],
    ),
    0,
  );
});
test("viewer cannot save; tenant, brand and POS scope hold for definitions and aggregates", async () => {
  const f = await fixture(),
    d = data();
  await act(f.company, "upsert", d);
  await assert.rejects(
    act(f.company, "upsert", data(), viewer),
    /access_denied/,
  );
  await assert.rejects(read(f.company, d.id, outsider), /access_denied/);
  await assert.rejects(read(f.company, d.id, manager), /brand_scope/);
  await db.query(
    "update sv_memberships set brand_ids=null where company_id=$1 and user_id=$2",
    [f.company, manager],
  );
  const p = data({
    includePos: true,
    rules: [{ kind: "payment", value: "paid" }],
  });
  await act(f.company, "upsert", p);
  assert.equal(
    (await read(f.company, undefined, manager)).segments.some(
      (s) => s.id === p.id,
    ),
    false,
  );
  await assert.rejects(read(f.company, p.id, manager), /segment_scope/);
  await assert.rejects(
    act(f.company, "preview", p, manager),
    /access_denied|product_required/,
  );
  await assert.rejects(
    act(
      f.company,
      "upsert",
      data({ rules: [{ kind: "payment", value: "paid" }] }),
    ),
    /segment_invalid/,
  );
});
test("verified positive net payment enters; full refund exits and never becomes consent", async () => {
  const f = await fixture(),
    c = await customer(f),
    d = data({ includePos: true, rules: [{ kind: "payment", value: "paid" }] });
  await act(f.company, "upsert", d);
  const order = "order-" + randomUUID(),
    payment = "pay-" + randomUUID();
  await db.query(
    "insert into sv_pos_orders(company_id,id,number,brand_id,contact_id,subtotal_cents,discount_cents,total_cents,voided,created_at,workspace_revision,snapshot)values($1,$2,'SYN','main',$3,100,0,100,false,1,0,'{}')",
    [f.company, order, c.id],
  );
  await db.query(
    "insert into sv_pos_payments(company_id,id,order_id,amount_cents,method,reference,occurred_at,actor,source,workspace_revision,snapshot)values($1,$2,$3,100,'cash','',1,'Synthetic','manual_verified',0,'{}')",
    [f.company, payment, order],
  );
  assert.equal((await read(f.company, d.id)).selected.count, 1);
  await db.query(
    "insert into sv_pos_refunds(company_id,id,order_id,amount_cents,reason,occurred_at,actor,source,workspace_revision,snapshot)values($1,$2,$3,100,'Synthetic refund',2,'Synthetic','manual_verified',0,'{}')",
    [f.company, "refund-" + randomUUID(), order],
  );
  assert.equal((await read(f.company, d.id)).selected.count, 0);
  assert.equal(
    await value(
      "select count(*)v from sv_contact_preferences where company_id=$1",
      [f.company],
    ),
    0,
  );
});
test("campaign snapshot does not grow, and final admission rejects a customer who exits", async () => {
  const f = await fixture(),
    c = await customer(f),
    d = data();
  await db.query(
    "update sv_customers set tags='[\"interested\"]'where company_id=$1 and id=$2",
    [f.company, c.id],
  );
  await act(f.company, "upsert", d);
  await rpc("sv_engagement_action", [
    f.company,
    owner,
    randomUUID(),
    "policy",
    JSON.stringify({
      marketingEnabled: true,
      executionPaused: false,
      quietStart: 0,
      quietEnd: 0,
      frequencyHours: 72,
      dailyLimit: 1000,
      minuteLimit: 100,
      revision: 0,
    }),
  ]);
  await rpc("sv_engagement_action", [
    f.company,
    owner,
    randomUUID(),
    "preference",
    JSON.stringify({
      customerId: c.id,
      brandId: "main",
      channel: "whatsapp",
      purpose: "marketing",
      allowed: true,
      source: "Synthetic explicit consent",
      revision: 0,
    }),
  ]);
  const campaign = randomUUID();
  await rpc("sv_engagement_action", [
    f.company,
    owner,
    randomUUID(),
    "campaign",
    JSON.stringify({
      id: campaign,
      brandId: "main",
      provider: "whatsapp",
      connectionId: f.connection,
      name: "Synthetic campaign",
      purpose: "marketing",
      definition: { kind: "text", body: "Hello {{name}}", values: [] },
      audience: { segmentId: d.id },
      dueAt: new Date().toISOString(),
    }),
  ]);
  const job = await value<string>(
    "select id v from sv_delivery_jobs where company_id=$1 and source_id=$2",
    [f.company, campaign],
  );
  assert.ok(job);
  const newCustomer = await customer(f);
  await db.query(
    "update sv_customers set tags='[\"interested\"]'where company_id=$1 and id=$2",
    [f.company, newCustomer.id],
  );
  assert.equal(
    await value(
      "select count(*)v from sv_delivery_jobs where company_id=$1 and source_id=$2",
      [f.company, campaign],
    ),
    1,
  );
  await db.query(
    "update sv_customers set tags='[]'where company_id=$1 and id=$2",
    [f.company, c.id],
  );
  const r = await rpc("sv_delivery_claim", [f.company, job]);
  assert.equal(r.dispatch, false);
  assert.equal(r.reason, "segment_changed");
  assert.equal(
    await value(
      "select count(*)v from sv_wa_messages where company_id=$1 and direction='outgoing'",
      [f.company],
    ),
    0,
  );
});
test("browser roles cannot read raw segments, membership, audit or execute evaluation", async () => {
  assert.equal(
    await value(
      "select count(*)v from information_schema.role_table_grants where table_schema='public'and table_name in('sv_dynamic_segments','sv_segment_members','sv_segment_events','sv_segment_dirty')and grantee in('anon','authenticated','PUBLIC')",
    ),
    0,
  );
  assert.equal(
    await value(
      "select count(*)v from information_schema.role_routine_grants where specific_schema in('public','smartvolt_private')and(routine_name like 'segment_%'or routine_name like 'sv_segment_%'or routine_name like 'sv_segments_%')and grantee in('anon','authenticated','PUBLIC')",
    ),
    0,
  );
});
test("browser schema bounds expression size and rejects forged predicates", () => {
  assert.equal(
    segmentActionSchema.safeParse({
      action: "preview",
      brandId: "main",
      mode: "all",
      rules: [{ kind: "sql", value: "true" }],
    }).success,
    false,
  );
  assert.equal(
    segmentActionSchema.safeParse({
      action: "preview",
      brandId: "main",
      mode: "all",
      includePos: false,
      rules: [{ kind: "payment", value: "paid" }],
    }).success,
    false,
  );
  assert.equal(
    segmentActionSchema.safeParse({
      action: "preview",
      brandId: "main",
      mode: "all",
      rules: Array.from({ length: 11 }, () => ({ kind: "tag", value: "a" })),
    }).success,
    false,
  );
});

test("pausing a segment exits existing members; revoked creator authority also fails closed automatically", async () => {
  const f = await fixture(),
    c = await customer(f),
    d = data();
  await db.query(
    "update sv_customers set tags='[\"interested\"]'where company_id=$1 and id=$2",
    [f.company, c.id],
  );
  await act(f.company, "upsert", d);
  await act(f.company, "upsert", {
    ...d,
    commandId: randomUUID(),
    revision: 1,
    enabled: false,
  });
  assert.equal((await read(f.company, d.id)).selected.count, 0);
  await act(f.company, "upsert", {
    ...d,
    commandId: randomUUID(),
    revision: 2,
    enabled: true,
  });
  assert.equal((await read(f.company, d.id)).selected.count, 1);
  await db.query(
    "update sv_memberships set role='viewer'where company_id=$1 and user_id=$2",
    [f.company, owner],
  );
  const pending = await read(f.company, d.id, viewer);
  assert.equal(pending.refreshPending, true);
  // Source authority takes effect before the deferred materialized refresh.
  assert.equal(
    await rpc("smartvolt_private.segment_customer_allowed", [
      f.company,
      viewer,
      "main",
      d.id,
      c.id,
    ]),
    false,
  );
  await rpc("sv_segments_catchup", [f.company]);
  const p = await read(f.company, d.id, viewer);
  assert.equal(p.refreshPending, false);
  assert.equal(p.selected.count, 0);
  assert.equal(p.selected.lastError, "authority_changed");
  assert.equal(
    await rpc("smartvolt_private.segment_customer_allowed", [
      f.company,
      viewer,
      "main",
      d.id,
      c.id,
    ]),
    false,
  );
});

test("scheduled catchup reconciles stale recency materialization without a source edit", async () => {
  const f = await fixture(),
    d = data({ rules: [{ kind: "recent_inbound", days: 1 }] });
  await customer(f);
  await act(f.company, "upsert", d);
  assert.equal((await read(f.company, d.id)).selected.count, 1);
  await db.query(
    "select smartvolt_private.segment_refresh($1,$2,statement_timestamp()+interval '2 days',null,'scheduled_refresh')",
    [f.company, d.id],
  );
  assert.equal((await read(f.company, d.id)).selected.count, 0);
  await db.query(
    "update sv_dynamic_segments set full_evaluated_at=now()-interval '2 minutes'where company_id=$1 and id=$2",
    [f.company, d.id],
  );
  await rpc("sv_segments_catchup", [f.company]);
  assert.equal((await read(f.company, d.id)).selected.count, 1);
  assert.equal(
    await value("select count(*)v from sv_segment_dirty where company_id=$1", [
      f.company,
    ]),
    0,
  );
});

test("current segment membership cannot bypass the original consent admission", async () => {
  const f = await fixture(),
    d = data({ rules: [{ kind: "channel", value: "whatsapp" }] });
  await customer(f);
  await act(f.company, "upsert", d);
  await rpc("sv_engagement_action", [
    f.company,
    owner,
    randomUUID(),
    "policy",
    JSON.stringify({
      marketingEnabled: true,
      quietStart: 0,
      quietEnd: 0,
      frequencyHours: 72,
      dailyLimit: 1000,
      minuteLimit: 100,
      revision: 0,
    }),
  ]);
  const campaign = randomUUID();
  await rpc("sv_engagement_action", [
    f.company,
    owner,
    randomUUID(),
    "campaign",
    JSON.stringify({
      id: campaign,
      brandId: "main",
      provider: "whatsapp",
      connectionId: f.connection,
      name: "Synthetic no-consent campaign",
      purpose: "marketing",
      definition: { kind: "text", body: "Hello {{name}}", values: [] },
      audience: { segmentId: d.id },
      dueAt: new Date().toISOString(),
    }),
  ]);
  const job = await value<string>(
    "select id v from sv_delivery_jobs where company_id=$1 and source_id=$2",
    [f.company, campaign],
  );
  const r = await rpc("sv_delivery_claim", [f.company, job]);
  assert.equal(r.dispatch, false);
  assert.equal(r.reason, "consent_missing");
});

test("source-backed journeys freeze their segment on version and recheck membership at every step", async () => {
  const f = await fixture(),
    c = await customer(f),
    outside = await customer(f),
    d = data();
  await db.query(
    "update sv_customers set tags='[\"interested\"]'where company_id=$1 and id=$2",
    [f.company, c.id],
  );
  await act(f.company, "upsert", d);
  const journey = randomUUID(),
    definition = {
      id: journey,
      brandId: "main",
      provider: "whatsapp",
      connectionId: f.connection,
      name: "Synthetic targeted journey",
      recipe: "unanswered",
      purpose: "service",
      revision: 0,
      enabled: true,
      segmentId: d.id,
      steps: [
        {
          delayMinutes: 60,
          definition: { kind: "text", body: "Hello {{name}}", values: [] },
        },
      ],
    };
  await rpc("sv_journey_action", [
    f.company,
    owner,
    randomUUID(),
    "publish",
    JSON.stringify(definition),
  ]);
  for (const thread of [c.thread, outside.thread]) {
    const id = randomUUID();
    await db.query(
      "insert into sv_wa_messages(id,company_id,connection_id,conversation_id,provider_id,fingerprint,direction,body,message_type,provider_at,author_name,state)values($1,$2,$3,$4,$5,$6,'incoming','Synthetic reply','text',$7,'Customer','delivered')",
      [
        id,
        f.company,
        f.connection,
        thread,
        "wamid." + id,
        "a".repeat(64),
        Date.now(),
      ],
    );
  }
  assert.equal(
    await value(
      "select count(*)v from sv_journey_runs where company_id=$1 and journey_id=$2",
      [f.company, journey],
    ),
    1,
  );
  assert.equal(
    await value(
      "select segment_id v from sv_journey_versions where company_id=$1 and journey_id=$2 and version=1",
      [f.company, journey],
    ),
    d.id,
  );
  const job = await value<string>(
    "select d.id v from sv_delivery_jobs d join sv_journey_runs r on r.company_id=d.company_id and r.id=d.source_id where d.company_id=$1 and r.journey_id=$2",
    [f.company, journey],
  );
  await db.query(
    "update sv_customers set tags='[]'where company_id=$1 and id=$2",
    [f.company, c.id],
  );
  const reason = await value(
    "select smartvolt_private.journey_admit(j)v from public.sv_delivery_jobs j where j.company_id=$1 and j.id=$2",
    [f.company, job],
  );
  assert.equal(reason, "segment_changed");
  await rpc("sv_journey_action", [
    f.company,
    owner,
    randomUUID(),
    "toggle",
    JSON.stringify({ id: journey, revision: 1, enabled: false }),
  ]);
  await rpc("sv_journey_action", [
    f.company,
    owner,
    randomUUID(),
    "toggle",
    JSON.stringify({ id: journey, revision: 2, enabled: true }),
  ]);
  assert.equal(
    await value(
      "select segment_id v from sv_journey_versions where company_id=$1 and journey_id=$2 and version=2",
      [f.company, journey],
    ),
    d.id,
  );
});

test("POS-targeted journey history and counts stay hidden after actor POS revocation", async () => {
  const f = await fixture(),
    c = await customer(f),
    d = data({ includePos: true, rules: [{ kind: "visit", value: "never" }] });
  await act(f.company, "upsert", d);
  const journey = randomUUID();
  await rpc("sv_journey_action", [
    f.company,
    owner,
    randomUUID(),
    "publish",
    JSON.stringify({
      id: journey,
      brandId: "main",
      provider: "whatsapp",
      connectionId: f.connection,
      name: "Synthetic POS-targeted journey",
      recipe: "unanswered",
      purpose: "service",
      revision: 0,
      enabled: true,
      segmentId: d.id,
      steps: [
        {
          delayMinutes: 60,
          definition: { kind: "text", body: "Hello {{name}}", values: [] },
        },
      ],
    }),
  ]);
  const message = randomUUID();
  await db.query(
    "insert into sv_wa_messages(id,company_id,connection_id,conversation_id,provider_id,fingerprint,direction,body,message_type,provider_at,author_name,state)values($1,$2,$3,$4,$5,$6,'incoming','Synthetic reply','text',$7,'Customer','delivered')",
    [
      message,
      f.company,
      f.connection,
      c.thread,
      "wamid." + message,
      "a".repeat(64),
      Date.now(),
    ],
  );
  await db.query(
    "update sv_memberships set brand_ids=null where company_id=$1 and user_id=$2",
    [f.company, manager],
  );
  await assert.rejects(
    act(f.company, "upsert", {
      ...d,
      commandId: randomUUID(),
      revision: 1,
      includePos: false,
      rules: [{ kind: "channel", value: "whatsapp" }],
    }),
    /segment_identity_changed/,
  );
  await assert.rejects(
    act(
      f.company,
      "upsert",
      {
        ...d,
        commandId: randomUUID(),
        revision: 1,
        includePos: false,
        rules: [{ kind: "channel", value: "whatsapp" }],
      },
      manager,
    ),
    /access_denied|product_required/,
  );
  await assert.rejects(read(f.company, d.id, manager), /segment_scope/);
  await assert.rejects(
    db.query(
      "update sv_dynamic_segments set include_pos=false where company_id=$1 and id=$2",
      [f.company, d.id],
    ),
    /segment_identity_changed/,
  );
  const list = await rpc<{ journeys: { id: string }[] }>("sv_journey_read", [
    f.company,
    manager,
  ]);
  assert.equal(
    list.journeys.some((j) => j.id === journey),
    false,
  );
  const history = await rpc<{ total: number; runs: unknown[] }>(
    "sv_journey_history",
    [f.company, manager, journey],
  );
  assert.equal(history.total, 0);
  assert.deepEqual(history.runs, []);
  await db.query(
    "update sv_memberships set product_ids=array['crm']where company_id=$1 and user_id=$2",
    [f.company, owner],
  );
  // Membership revocation queues reconciliation while current-facts admission
  // already rejects the old materialization.
  const reason = await value(
    "select smartvolt_private.journey_admit(j)v from public.sv_delivery_jobs j join public.sv_journey_runs r on r.company_id=j.company_id and r.id=j.source_id where j.company_id=$1 and r.journey_id=$2",
    [f.company, journey],
  );
  assert.equal(reason, "segment_changed");
  await rpc("sv_segments_catchup", [f.company]);
  assert.equal(
    await value(
      "select count(*)v from sv_segment_members where company_id=$1 and segment_id=$2 and active",
      [f.company, d.id],
    ),
    0,
  );
  const stopped = await rpc("sv_journey_action", [
    f.company,
    owner,
    randomUUID(),
    "toggle",
    JSON.stringify({ id: journey, revision: 1, enabled: false }),
  ]);
  assert.equal(stopped.saved, true);
});

test("native smoke snippet executes inside rollback without leaving memberships or audit", async () => {
  const f = await fixture();
  await db.query(
    "insert into sv_customers(company_id,id,name)values($1,'synthetic-customer','Synthetic')",
    [f.company],
  );
  await db.query(
    "insert into sv_customer_brands(company_id,customer_id,brand_id)values($1,'synthetic-customer','main')",
    [f.company],
  );
  await db.exec("begin");
  try {
    await db.query("select set_config('convelta.verify.company',$1,true)", [
      f.company,
    ]);
    await db.exec(readFileSync("scripts/verify-segments-snippet.sql", "utf8"));
  } finally {
    await db.exec("rollback");
  }
  assert.equal(
    await value(
      "select count(*)v from sv_dynamic_segments where company_id=$1",
      [f.company],
    ),
    0,
  );
  assert.equal(
    await value("select count(*)v from sv_segment_events where company_id=$1", [
      f.company,
    ]),
    0,
  );
});

test("workspace inbox edits enqueue full reconciliation without scanning every segment inline", async () => {
  const f = await fixture(),
    c = await customer(f),
    d = data({ rules: [{ kind: "recent_inbound", days: 1 }] });
  await act(f.company, "upsert", d);
  await rpc("sv_segments_catchup", [f.company]);
  // Put the materialization in a stale state using a deterministic future clock.
  await db.query(
    "select smartvolt_private.segment_refresh($1,$2,statement_timestamp()+interval '2 days',null,'scheduled_refresh')",
    [f.company, d.id],
  );
  assert.equal((await read(f.company, d.id)).selected.count, 0);
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{inbox}',(payload->'inbox')||jsonb_build_object('selectedConversationId',$2::text))where company_id=$1",
    [f.company, c.thread],
  );
  const pending = await read(f.company, d.id);
  assert.equal(pending.refreshPending, true);
  assert.equal(
    pending.selected.count,
    0,
    "the ordinary write did not run a full refresh",
  );
  assert.equal(
    await rpc("smartvolt_private.segment_customer_allowed", [
      f.company,
      owner,
      "main",
      d.id,
      c.id,
    ]),
    true,
    "dispatch uses current facts rather than the stale materialization",
  );
  const receipt = await rpc("sv_segments_catchup", [f.company]);
  assert.equal(receipt.checked, 1);
  const refreshed = await read(f.company, d.id);
  assert.equal(refreshed.refreshPending, false);
  assert.equal(refreshed.selected.count, 1);
});

test("POS-selected campaign history and aggregates retain source authority before pagination", async () => {
  const f = await fixture(),
    c = await customer(f),
    d = data({ includePos: true, rules: [{ kind: "visit", value: "never" }] });
  await act(f.company, "upsert", d);
  await rpc("sv_engagement_action", [
    f.company,
    owner,
    randomUUID(),
    "policy",
    JSON.stringify({
      marketingEnabled: true,
      quietStart: 0,
      quietEnd: 0,
      frequencyHours: 72,
      dailyLimit: 1000,
      minuteLimit: 100,
      revision: 0,
    }),
  ]);
  const posCampaign = randomUUID(),
    crmCampaign = randomUUID();
  for (const id of [posCampaign, crmCampaign]) {
    await rpc("sv_engagement_action", [
      f.company,
      owner,
      randomUUID(),
      "campaign",
      JSON.stringify({
        id,
        brandId: "main",
        provider: "whatsapp",
        connectionId: f.connection,
        name: "Synthetic campaign",
        purpose: "marketing",
        definition: { kind: "text", body: "Hello {{name}}", values: [] },
        audience: id === posCampaign ? { segmentId: d.id } : {},
        dueAt: new Date().toISOString(),
      }),
    ]);
  }
  type History = {
    campaigns: { id: string }[];
    results: { customer_id: string }[];
    resultTotal: number;
    resultCounts: Record<string, number>;
  };
  const before = await rpc<History>("sv_engagement_read", [
    f.company,
    owner,
    JSON.stringify({ campaign: posCampaign }),
  ]);
  assert.equal(before.resultTotal, 1);
  assert.equal(before.results[0].customer_id, c.id);
  // A later non-POS-looking rule cannot downgrade the historical POS source.
  await act(f.company, "upsert", {
    ...d,
    commandId: randomUUID(),
    revision: 1,
    rules: [{ kind: "channel", value: "whatsapp" }],
  });
  await db.query(
    "update sv_memberships set brand_ids=null where company_id=$1 and user_id=$2",
    [f.company, manager],
  );
  const restricted = await rpc<History>("sv_engagement_read", [
    f.company,
    manager,
    JSON.stringify({ campaign: posCampaign }),
  ]);
  assert.deepEqual(
    restricted.campaigns.map((x) => x.id),
    [crmCampaign],
  );
  assert.deepEqual(restricted.results, []);
  assert.equal(restricted.resultTotal, 0);
  assert.deepEqual(restricted.resultCounts, {});
  const crmHistory = await rpc<History>("sv_engagement_read", [
    f.company,
    manager,
    JSON.stringify({ campaign: crmCampaign }),
  ]);
  assert.equal(crmHistory.resultTotal, 1);
  await db.query(
    "update sv_memberships set product_ids=array['crm']where company_id=$1 and user_id=$2",
    [f.company, owner],
  );
  const revoked = await rpc<History>("sv_engagement_read", [
    f.company,
    owner,
    JSON.stringify({ campaign: posCampaign }),
  ]);
  assert.deepEqual(revoked.results, []);
  assert.equal(revoked.resultTotal, 0);
  assert.equal(
    revoked.campaigns.some((x) => x.id === posCampaign),
    false,
  );
  assert.equal(
    await rpc("smartvolt_private.segment_campaign_visible", [
      f.company,
      manager,
      randomUUID(),
    ]),
    false,
  );
});
