import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
const db = new PGlite(),
  company = "11111111-1111-4111-8111-111111111111",
  foreign = "22222222-2222-4222-8222-222222222222",
  pos = "33333333-3333-4333-8333-333333333333",
  owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  viewer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  agent = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
async function one(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows[0];
}
async function revision(target = company) {
  return Number(
    (
      await one(
        "select revision from public.sv_workspaces where company_id=$1",
        [target],
      )
    ).revision,
  );
}
async function configure(enabled: boolean, actor = owner, target = company) {
  return db.query("select public.sv_ai_configure($1,$2,$3)", [
    target,
    actor,
    enabled,
  ]);
}
async function claim(
  id = randomUUID(),
  actor = owner,
  target = company,
  source = "playground",
  sourceId: string | null = null,
  sourceRevision: number | null = null,
  hash = "a".repeat(64),
  expected?: number,
) {
  return (
    await one(
      "select public.sv_ai_claim($1,$2,$3,'main',$4,$5,$6,$7,'synthetic/model',$8) value",
      [
        target,
        actor,
        id,
        source,
        sourceId,
        expected ?? (await revision(target)),
        sourceRevision,
        hash,
      ],
    )
  ).value as {
    dispatch: boolean;
    status: string;
    result: unknown;
    error_code?: string;
  };
}
async function finish(
  id: string,
  actor = owner,
  result: object | null = { reply: "synthetic" },
  error: string | null = null,
) {
  return (
    await one("select public.sv_ai_finish($1,$2,$3,$4::jsonb,$5,20,10)value", [
      company,
      actor,
      id,
      result ? JSON.stringify(result) : null,
      error,
    ])
  ).value as { status: string; error_code?: string; result: unknown };
}
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
    viewer,
    other,
    agent,
  ]);
  await db.exec("set role service_role");
  for (const [id, user, products] of [
    [company, owner, ["crm"]],
    [foreign, other, ["crm"]],
    [pos, owner, ["pos"]],
  ] as const) {
    const state = createCompanyState({
      companyId: id,
      companyName: "Synthetic",
      brands: [{ id: "main", name: "Synthetic", short: "S" }],
      team: [{ id: user, name: "Owner", initials: "O" }],
    });
    await db.query(
      "select public.sv_provision_company($1,'Synthetic',$2,'Owner',$3::jsonb,$4::text[])",
      [id, user, JSON.stringify(state), [...products]],
    );
  }
  await db.query(
    "insert into public.sv_memberships(company_id,user_id,role,display_name)values($1,$2,'viewer','Viewer'),($1,$3,'agent','Agent')",
    [company, viewer, agent],
  );
});
after(() => db.close());
test("only company Owner can enable AI, while active CRM writers may generate", async () => {
  await assert.rejects(() => claim(), /ai_disabled/);
  await assert.rejects(() => configure(true, viewer), /ai_access_denied/);
  await assert.rejects(() => configure(true, agent), /ai_access_denied/);
  await assert.rejects(
    () => configure(true, owner, pos),
    /ai_product_required/,
  );
  await configure(true);
  await assert.rejects(() => claim(randomUUID(), viewer), /ai_access_denied/);
  await assert.rejects(() => claim(randomUUID(), other), /ai_access_denied/);
  const id = randomUUID();
  assert.equal((await claim(id, agent)).dispatch, true);
  await finish(id, agent);
});
test("AI dispatch is claimed once and its terminal receipt is immutable", async () => {
  const id = randomUUID();
  assert.equal((await claim(id)).dispatch, true);
  assert.equal((await claim(id)).dispatch, false);
  await assert.rejects(
    () => claim(id, owner, company, "playground", null, null, "b".repeat(64)),
    /ai_idempotency_conflict/,
  );
  await assert.rejects(() => claim(id, agent), /ai_idempotency_conflict/);
  assert.equal((await finish(id)).status, "completed");
  assert.deepEqual((await claim(id)).result, { reply: "synthetic" });
  await assert.rejects(
    () =>
      db.query(
        "update public.sv_ai_requests set result='{}' where request_id=$1",
        [id],
      ),
    /ai_receipt_immutable/,
  );
  await assert.rejects(() => db.exec("delete from public.sv_ai_requests"));
  await assert.rejects(() => db.exec("truncate public.sv_ai_requests"));
});
test("caller cannot attach another tenant's conversation, brand or thread", async () => {
  await assert.rejects(
    () =>
      claim(
        randomUUID(),
        owner,
        company,
        "conversation",
        "foreign-conversation",
      ),
    /ai_conversation_scope/,
  );
  await assert.rejects(() =>
    claim(randomUUID(), owner, company, "meta", randomUUID(), 1),
  );
  await assert.rejects(
    async () =>
      db.query(
        "select public.sv_ai_claim($1,$2,$3,'foreign-brand','playground',null,$4,null,'synthetic/model',$5)",
        [company, owner, randomUUID(), await revision(), "a".repeat(64)],
      ),
    /ai_brand_scope/,
  );
  await assert.rejects(() =>
    db.query(
      "insert into public.sv_ai_requests(company_id,request_id,actor_id,brand_id,source,workspace_revision,model,request_hash)values($1,$2,$3,'main','playground',0,'synthetic/model',$4)",
      [company, randomUUID(), other, "a".repeat(64)],
    ),
  );
});
test("knowledge revision changes or owner suspension discard generated drafts", async () => {
  const id = randomUUID(),
    expected = await revision();
  await claim(id);
  await db.query(
    "update public.sv_workspaces set revision=revision+1 where company_id=$1",
    [company],
  );
  assert.equal((await finish(id)).error_code, "context_changed");
  await assert.rejects(
    () =>
      claim(
        randomUUID(),
        owner,
        company,
        "playground",
        null,
        null,
        "a".repeat(64),
        expected,
      ),
    /ai_context_changed/,
  );
  const disabled = randomUUID();
  await claim(disabled);
  await configure(false);
  assert.equal((await finish(disabled)).error_code, "disabled");
  await configure(true);
});
test("quota claims serialize, count failures, and do not bill a replay twice", async () => {
  const n = Number(
    (
      await one(
        "select count(*)::int n from public.sv_ai_requests where company_id=$1",
        [company],
      )
    ).n,
  );
  await db.query(
    "update public.sv_ai_settings set daily_limit=$2 where company_id=$1",
    [company, n + 1],
  );
  const ids = [randomUUID(), randomUUID()];
  const results = await Promise.allSettled([
    claim(ids[0]),
    claim(ids[1], agent),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const winning = results[0].status === "fulfilled" ? 0 : 1,
    actor = winning === 0 ? owner : agent;
  await finish(ids[winning], actor, null, "unavailable");
  assert.equal((await claim(ids[winning], actor)).dispatch, false);
  await assert.rejects(() => claim(randomUUID()), /ai_daily_limit/);
  await db.query(
    "update public.sv_ai_settings set daily_limit=30 where company_id=$1",
    [company],
  );
});
test("quota day begins at Hong Kong midnight and browser roles cannot access AI ledgers or RPCs", async () => {
  const day =
    "date_trunc('day',now() at time zone 'Asia/Hong_Kong')at time zone 'Asia/Hong_Kong'";
  await db.query(
    `insert into public.sv_ai_requests(company_id,request_id,actor_id,brand_id,source,workspace_revision,model,request_hash,status,error_code,created_at,finished_at)select $1,gen_random_uuid(),$2,'main','playground',0,'synthetic/model',repeat('a',64),'failed','unavailable',(${day})-interval '1 second',now() from generate_series(1,35)`,
    [company, owner],
  );
  const id = randomUUID();
  assert.equal((await claim(id)).dispatch, true);
  await finish(id);
  for (const role of ["anon", "authenticated"]) {
    await db.exec("reset role;set role " + role);
    await assert.rejects(() => db.exec("select * from public.sv_ai_requests"));
    await assert.rejects(() =>
      db.query("select public.sv_ai_configure($1,$2,true)", [company, owner]),
    );
  }
  await db.exec("reset role;set role service_role");
  const grants = await one(
    "select has_table_privilege('service_role','public.sv_ai_requests','DELETE')as delete,has_table_privilege('service_role','public.sv_ai_requests','TRUNCATE')as truncate",
  );
  assert.deepEqual(grants, { delete: false, truncate: false });
});
