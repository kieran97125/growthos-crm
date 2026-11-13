import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
import { snapshotSchema } from "../src/lib/copilot/model";
const db = new PGlite(),
  company = "11111111-1111-4111-8111-111111111111",
  foreign = "22222222-2222-4222-8222-222222222222",
  pos = "33333333-3333-4333-8333-333333333333",
  owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  viewer = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  connection = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const customers: string[] = [];
async function value<T = Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
) {
  return (await db.query<{ v: T }>(sql, args)).rows[0].v;
}
async function claim(
  request = randomUUID(),
  thread = randomUUID(),
  feature = "copilot",
  actor = owner,
  target = company,
  product = "crm",
  hash = "a".repeat(64),
) {
  const revision = await value<number>(
    "select revision v from sv_workspaces where company_id=$1",
    [target],
  );
  return {
    request,
    thread,
    ...(await value<{ dispatch: boolean; status: string; result: unknown }>(
      "select sv_copilot_claim($1,$2,$3,$4,$5,'main',$6,'Synthetic task',$7,'synthetic/model',$8)v",
      [target, actor, product, request, thread, hash, revision, feature],
    )),
  };
}
const campaign = {
  title: "Synthetic follow-up",
  objective: "Understand interest",
  audience: "Unbooked inquiries, consent not yet checked",
  message: "想了解你嘅需要，再一齊安排下一步。",
  steps: ["Review audience", "Review consent"],
  measures: ["Confirmed bookings"],
};
async function finish(
  id: string,
  thread: string,
  actor = owner,
  target = company,
) {
  return value<{ status: string; result: unknown }>(
    "select sv_copilot_finish($1,$2,$3,$4::jsonb,null,20,30)v",
    [
      target,
      actor,
      id,
      JSON.stringify({
        answer: "根據正式紀錄，建議先核對需要。",
        campaign,
        factIds: [],
        facts: [],
        nextQuestions: [],
        requestId: id,
        threadId: thread,
        createdAt: new Date().toISOString(),
      }),
    ],
  );
}
async function action(
  data: object,
  command = randomUUID(),
  actor = owner,
  target = company,
  product = "crm",
) {
  return value("select sv_copilot_action($1,$2,$3,$4,$5::jsonb)v", [
    target,
    actor,
    product,
    command,
    JSON.stringify(data),
  ]);
}
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to service_role,authenticated;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.query("insert into auth.users values($1),($2),($3)", [
    owner,
    other,
    viewer,
  ]);
  await db.exec("set role service_role");
  for (const [id, user, products] of [
    [company, owner, ["crm", "pos"]],
    [foreign, other, ["crm"]],
    [pos, owner, ["pos"]],
  ] as const) {
    const state = createCompanyState({
      companyId: id,
      companyName: "Synthetic company",
      brands: [{ id: "main", name: "Main", short: "M" }],
      team: [{ id: user, name: "Owner", initials: "O" }],
    });
    await db.query(
      "select sv_provision_company($1,'Synthetic',$2,'Owner',$3::jsonb,$4::text[])",
      [id, user, JSON.stringify(state), [...products]],
    );
  }
  await db.query(
    "insert into sv_memberships(company_id,user_id,role,display_name)values($1,$2,'viewer','Viewer')",
    [company, viewer],
  );
  await db.query("select sv_ai_configure($1,$2,true)", [company, owner]);
  await db.query(
    "insert into sv_meta_connections(id,company_id,brand_id,channel,app_id,page_id,account_id,label,credentials)values($1,$2,'main','messenger','90001','10001','10001','Synthetic','{\"test\":true}')",
    [connection, company],
  );
  for (let i = 1; i <= 60; i++) {
    const thread = randomUUID();
    await db.query(
      "insert into sv_meta_threads(id,company_id,connection_id,peer_id,last_inbound_at,follow_up_at)values($1,$2,$3,$4,floor(extract(epoch from now()-interval'20 days')*1000),case when $5::boolean then now()-interval'1 hour'else null end)",
      [thread, company, connection, String(20000 + i), i <= 5],
    );
    const customer = String(
      await value(
        "select customer_id v from sv_customer_threads where company_id=$1 and provider='meta'and thread_id=$2",
        [company, thread],
      ),
    );
    customers.push(customer);
    await db.query(
      "update sv_customers set name=$3,phone='85260000000',note='PRIVATE NOTE NEVER SENT',tags=$4::jsonb where company_id=$1 and id=$2",
      [
        company,
        customer,
        "c" + i,
        JSON.stringify([i <= 20 ? "Interested" : "Other"]),
      ],
    );
    await db.query(
      "insert into sv_meta_messages(company_id,thread_id,direction,body,state,created_at)values($1,$2,'inbound',$3,'received',now()-interval'20 days')",
      [
        company,
        thread,
        i === 1 ? "想預約星期六，有咩時段？" : "想了解服務收費",
      ],
    );
    if (i <= 18 || i === 21 || i === 22)
      await db.query(
        "insert into sv_booking_requests(company_id,id,customer_id,brand_id,provider,thread_id,service,desired_at,guests,status)values($1,$2,$3,'main','meta',$4,'Synthetic service',now()+interval'1 day',1,'confirmed')",
        [company, randomUUID(), customer, thread],
      );
  }
});
after(() => db.close());
test("complete snapshot aggregates all customers before limiting groups, deduplicates bookings, and excludes private fields", async () => {
  const s = snapshotSchema.parse(
    await value("select sv_copilot_snapshot($1,$2,'crm','main',$3)v", [
      company,
      owner,
      customers[0],
    ]),
  );
  assert.equal(s.customers, 60);
  assert.equal(s.inquiries, 60);
  assert.equal(s.confirmed, 20);
  assert.equal(s.overdue, 5);
  assert.equal(s.customer?.lastMessage, "想預約星期六，有咩時段？");
  assert.equal(s.segments.find((g) => g.label === "Interested")?.booked, 18);
  assert(!JSON.stringify(s).includes("PRIVATE NOTE"));
  assert(!JSON.stringify(s).includes("85260000000"));
  assert.equal(s.broadcastCoverage, "unavailable");
});
test("cross-company, brand, customer and purchased-product scopes cannot be supplied by a caller", async () => {
  for (const args of [
    [company, other, "crm", null, null],
    [company, owner, "crm", "foreign", null],
    [company, owner, "crm", null, "missing"],
    [pos, owner, "crm", null, null],
  ])
    await assert.rejects(
      () => db.query("select sv_copilot_snapshot($1,$2,$3,$4,$5)", args),
      /access_denied|brand_scope|customer_scope|product_required/,
    );
  const s = snapshotSchema.parse(
    await value("select sv_copilot_snapshot($1,$2,'pos')v", [pos, owner]),
  );
  assert.equal(s.inquiries, 0);
  assert.equal(s.pos?.appointments, 0);
  assert.equal(s.customer, null);
});
test("claims are immutable, replayable, actor-bound and share the existing company AI ledger", async () => {
  const r = await claim();
  assert(r.dispatch);
  assert.equal((await claim(r.request, r.thread)).dispatch, false);
  await assert.rejects(
    () => claim(r.request, r.thread, "copilot", other),
    /access_denied/,
  );
  await assert.rejects(
    () =>
      claim(
        r.request,
        r.thread,
        "copilot",
        owner,
        company,
        "crm",
        "b".repeat(64),
      ),
    /idempotency/,
  );
  assert.equal((await finish(r.request, r.thread)).status, "completed");
  assert.equal((await claim(r.request, r.thread)).status, "completed");
  await assert.rejects(
    () =>
      db.query(
        "update sv_ai_requests set feature='reply'where company_id=$1 and request_id=$2",
        [company, r.request],
      ),
    /immutable/,
  );
});
test("C memory belongs to the current actor and product, even when thread IDs are known", async () => {
  const r = await claim();
  await finish(r.request, r.thread);
  const mine = await value<{ messages: unknown[] }>(
    "select sv_copilot_memory($1,$2,'crm','Synthetic')v",
    [company, owner],
  );
  assert(mine.messages.length >= 1);
  const otherProduct = await value<{ messages: unknown[] }>(
    "select sv_copilot_memory($1,$2,'pos','Synthetic')v",
    [company, owner],
  );
  assert.equal(otherProduct.messages.length, 0);
  await assert.rejects(
    () =>
      db.query("select sv_copilot_memory($1,$2,'crm','Synthetic')", [
        company,
        other,
      ]),
    /access_denied/,
  );
  await action(
    { client: { action: "configure", enabled: true } },
    randomUUID(),
    other,
    foreign,
  );
  const isolated = await claim(
    randomUUID(),
    r.thread,
    "copilot",
    other,
    foreign,
  );
  assert(isolated.dispatch);
  await finish(isolated.request, isolated.thread, other, foreign);
});
test("a POS-only owner can enable and use C without buying CRM; viewers cannot dispatch", async () => {
  await action(
    { client: { action: "configure", enabled: true } },
    randomUUID(),
    owner,
    pos,
    "pos",
  );
  const r = await claim(
    randomUUID(),
    randomUUID(),
    "copilot",
    owner,
    pos,
    "pos",
  );
  await finish(r.request, r.thread, owner, pos);
  await assert.rejects(
    () => claim(randomUUID(), randomUUID(), "copilot", viewer),
    /access_denied/,
  );
});
test("tag adoption is revision checked, atomic, audited and a replay cannot overwrite later changes", async () => {
  const revision = Number(
    await value(
      "select revision v from sv_customers where company_id=$1 and id=$2",
      [company, customers[0]],
    ),
  );
  const command = randomUUID(),
    data = {
      client: { action: "tag", key: "synthetic", confirmed: true },
      customerId: customers[0],
      revision,
      tag: "預約意向",
    };
  await action(data, command);
  const saved = await value<string[]>(
    "select tags v from sv_customers where company_id=$1 and id=$2",
    [company, customers[0]],
  );
  assert(saved.includes("Interested") && saved.includes("預約意向"));
  await action(data, command);
  assert.equal(
    Number(
      await value(
        "select revision v from sv_customers where company_id=$1 and id=$2",
        [company, customers[0]],
      ),
    ),
    revision + 1,
  );
  await assert.rejects(() => action(data), /context_changed/);
  await assert.rejects(
    () => action({ ...data, tag: "Changed" }, command),
    /idempotency/,
  );
});
test("campaign drafts are saved from owned verified receipts, never from browser-supplied campaign text", async () => {
  const r = await claim();
  await finish(r.request, r.thread);
  const command = randomUUID(),
    data = { client: { action: "save-brief", requestId: r.request } };
  const saved = await action(data, command);
  assert(saved.saved);
  await action(data, command);
  assert.equal(
    Number(
      await value(
        "select count(*)v from sv_copilot_briefs where company_id=$1 and request_id=$2",
        [company, r.request],
      ),
    ),
    1,
  );
  await assert.rejects(
    () => action(data, randomUUID(), other, foreign),
    /no rows|not found|P0002/,
  );
  assert.equal(
    Number(
      await value(
        "select count(*)v from sv_meta_messages where direction='outbound'",
      ),
    ),
    0,
  );
});
test("proactive claims have an independent interruption cap and still consume the shared daily budget", async () => {
  const r = await claim(randomUUID(), randomUUID(), "proactive");
  await finish(r.request, r.thread);
  await assert.rejects(
    () => claim(randomUUID(), randomUUID(), "proactive"),
    /copilot_quiet/,
  );
  assert(
    Number(
      await value(
        "select count(*)v from sv_ai_requests where company_id=$1 and feature='proactive'",
        [company],
      ),
    ) === 1,
  );
});
test("browser roles have neither raw C table privileges nor RPC execution; message/command evidence is append only", async () => {
  for (const table of [
    "sv_copilot_threads",
    "sv_copilot_messages",
    "sv_copilot_feedback",
    "sv_copilot_briefs",
    "sv_copilot_commands",
  ]) {
    assert.equal(
      await value("select has_table_privilege('authenticated',$1,'select')v", [
        table,
      ]),
      false,
    );
    assert.equal(
      await value(
        "select relrowsecurity v from pg_class where oid=$1::regclass",
        [table],
      ),
      true,
    );
  }
  assert.equal(
    await value(
      "select has_function_privilege('authenticated','sv_copilot_snapshot(uuid,uuid,text,text,text)','execute')v",
    ),
    false,
  );
  for (const table of ["sv_copilot_messages", "sv_copilot_commands"])
    for (const op of ["update", "delete", "truncate"])
      assert.equal(
        await value("select has_table_privilege('service_role',$1,$2)v", [
          table,
          op,
        ]),
        false,
      );
});
test("a lost worker is reconciled once and a late completion cannot rewrite its terminal receipt", async () => {
  const request = randomUUID(),
    thread = randomUUID();
  await db.query(
    "insert into sv_copilot_threads(company_id,id,actor_id,product,title)values($1,$2,$3,'crm','Synthetic lost worker')",
    [company, thread, owner],
  );
  await db.query(
    "insert into sv_ai_requests(company_id,request_id,actor_id,brand_id,source,source_id,workspace_revision,model,request_hash,feature,created_at)values($1,$2,$3,'main','copilot',$4,0,'synthetic/model',repeat('a',64),'copilot',now()-interval'3 minutes')",
    [company, request, owner, thread],
  );
  const r = await value<{ status: string; error_code: string }>(
    "select sv_copilot_receipt($1,$2,'crm',$3)v",
    [company, owner, request],
  );
  assert.equal(r.status, "failed");
  assert.equal(r.error_code, "unavailable");
  assert.equal((await finish(request, thread)).status, "failed");
  assert.equal(
    Number(
      await value(
        "select count(*)v from sv_copilot_messages where company_id=$1 and thread_id=$2",
        [company, thread],
      ),
    ),
    0,
  );
});
