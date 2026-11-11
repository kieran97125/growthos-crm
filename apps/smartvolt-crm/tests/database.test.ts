import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createCompanyState } from "../src/lib/saas/workspace";
const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const ua = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ub = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const state = (id: string, user: string) =>
  createCompanyState({
    companyId: id,
    companyName: id,
    brands: [{ id: "main", name: "Main", short: "MAIN" }],
    team: [{ id: user, name: "Owner", initials: "O" }],
  });
before(async () => {
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth,public to authenticated,service_role; grant execute on function auth.uid() to authenticated;`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query("insert into auth.users values($1),($2)", [ua, ub]);
  await db.exec("set role service_role");
  for (const [company, user] of [
    [a, ua],
    [b, ub],
  ])
    await db.query(
      "select public.sv_provision_company($1,$2,$3,$4,$5::jsonb,$6::text[])",
      [
        company,
        company,
        user,
        "Owner",
        JSON.stringify(state(company, user)),
        ["crm", "pos"],
      ],
    );
  await db.exec("reset role");
});
after(async () => {
  await db.close();
});
const commit = (
  company: string,
  user: string,
  rev: number,
  id = randomUUID(),
  payload = state(company, user),
) =>
  db.query<{ sv_commit_workspace: { revision: number } }>(
    "select public.sv_commit_workspace($1,$2,$3,$4,$5::jsonb,$6)",
    [company, user, rev, id, JSON.stringify(payload), "inbox"],
  );
test("all private tenant tables have RLS and browser roles have no raw data grants", async () => {
  const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
    "select relname,relrowsecurity from pg_class where relname in ('sv_companies','sv_memberships','sv_workspaces','sv_commands','sv_workspace_versions','sv_system_cards','sv_company_products')",
  );
  assert.equal(rows.length, 7);
  assert.ok(rows.every((r) => r.relrowsecurity));
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(
      () => db.query("select * from public.sv_workspaces"),
      /permission denied/,
    );
    await assert.rejects(() => commit(a, ua, 0), /permission denied/);
    await db.exec("reset role");
  }
});
test("RLS still isolates company rows if a future migration grants SELECT", async () => {
  await db.exec(
    "grant select on public.sv_memberships,public.sv_companies,public.sv_workspaces to authenticated; set role authenticated;",
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ua]);
  assert.deepEqual(
    (
      await db.query<{ company_id: string }>(
        "select company_id from public.sv_workspaces",
      )
    ).rows.map((r) => r.company_id),
    [a],
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ub]);
  assert.deepEqual(
    (
      await db.query<{ company_id: string }>(
        "select company_id from public.sv_workspaces",
      )
    ).rows.map((r) => r.company_id),
    [b],
  );
  await db.exec(
    "reset role; revoke select on public.sv_memberships,public.sv_companies,public.sv_workspaces from authenticated;",
  );
});
test("foreign actor, viewer and suspended company writes are refused inside the database", async () => {
  await db.exec("set role service_role");
  await assert.rejects(() => commit(b, ua, 0), /access_denied/);
  await db.query(
    "update public.sv_memberships set role='viewer' where company_id=$1",
    [b],
  );
  await assert.rejects(() => commit(b, ub, 0), /access_denied/);
  await db.query(
    "update public.sv_memberships set role='owner' where company_id=$1",
    [b],
  );
  await db.query(
    "update public.sv_companies set status='suspended' where id=$1",
    [b],
  );
  await assert.rejects(() => commit(b, ub, 0), /access_denied/);
  await db.query("update public.sv_companies set status='active' where id=$1", [
    b,
  ]);
  await db.exec("reset role");
});
test("atomic revision check rejects stale writes; retries have one audit event and a recovery version", async () => {
  await db.exec("set role service_role");
  const id = randomUUID();
  assert.equal(
    (await commit(a, ua, 0, id)).rows[0].sv_commit_workspace.revision,
    1,
  );
  assert.equal(
    (await commit(a, ua, 0, id)).rows[0].sv_commit_workspace.revision,
    1,
  );
  await assert.rejects(() => commit(a, ua, 0), /revision_conflict/);
  assert.equal(
    (
      await db.query<{ count: number }>(
        "select count(*)::integer as count from public.sv_commands where company_id=$1",
        [a],
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (
      await db.query<{ count: number }>(
        "select count(*)::integer as count from public.sv_workspace_versions where company_id=$1",
        [a],
      )
    ).rows[0].count,
    1,
  );
  await db.exec("reset role");
});
test("company identity cannot be reassigned through a valid revision", async () => {
  await db.exec("set role service_role");
  await assert.rejects(
    () => commit(a, ua, 1, randomUUID(), state(b, ub)),
    /invalid_company_scope/,
  );
  await db.exec("reset role");
});
test("POS command families preserve database membership restrictions and admin-only refunds/settings", async () => {
  await db.exec("set role service_role");
  await db.query(
    "update public.sv_memberships set role='agent' where company_id=$1",
    [b],
  );
  const doc = (
    await db.query<{ payload: unknown; revision: number }>(
      "select payload,revision from public.sv_workspaces where company_id=$1",
      [b],
    )
  ).rows[0];
  const submit = (kind: string, rev: number) =>
    db.query("select public.sv_commit_workspace($1,$2,$3,$4,$5::jsonb,$6)", [
      b,
      ub,
      rev,
      randomUUID(),
      JSON.stringify(doc.payload),
      kind,
    ]);
  await assert.rejects(
    () => submit("pos-admin", doc.revision),
    /manager_required/,
  );
  await submit("pos", doc.revision);
  await submit("customer-create", Number(doc.revision) + 1);
  await db.query(
    "update public.sv_memberships set role='owner' where company_id=$1",
    [b],
  );
  await submit("pos-admin", Number(doc.revision) + 2);
  await db.exec("reset role");
});
test("new company provisioning includes concrete cards for acquiring, ledger, classes, stock and attribution", async () => {
  await db.exec("set role service_role");
  const { rows } = await db.query<{ id: string }>(
    "select id from public.sv_system_cards where company_id=$1 and id like 'pos-%'",
    [a],
  );
  assert.equal(rows.length, 5);
  await db.exec("reset role");
});
test("CRM-only, POS-only and dual purchases are enforced under the database write lock, independently of owner role", async () => {
  const company = "33333333-3333-4333-8333-333333333333";
  await db.exec("set role service_role");
  await db.query(
    "select public.sv_provision_company($1,$2,$3,$4,$5::jsonb,$6::text[])",
    [
      company,
      "CRM-only",
      ua,
      "Owner",
      JSON.stringify(state(company, ua)),
      ["crm"],
    ],
  );
  const submit = (kind: string, rev: number) =>
    db.query("select public.sv_commit_workspace($1,$2,$3,$4,$5::jsonb,$6)", [
      company,
      ua,
      rev,
      randomUUID(),
      JSON.stringify(state(company, ua)),
      kind,
    ]);
  await assert.rejects(() => submit("pos", 0), /product_not_purchased/);
  await assert.rejects(() => submit("pos-admin", 0), /product_not_purchased/);
  await submit("inbox", 0);
  await db.query("select public.sv_set_company_products($1,$2::text[])", [
    company,
    ["pos"],
  ]);
  await assert.rejects(() => submit("inbox", 1), /product_not_purchased/);
  await assert.rejects(() => submit("studio", 1), /product_not_purchased/);
  await submit("pos", 1);
  await submit("customer-create", 2);
  await db.query("select public.sv_set_company_products($1,$2::text[])", [
    company,
    ["crm", "pos"],
  ]);
  await submit("inbox", 3);
  await submit("pos", 4);
  await db.query("select public.sv_set_company_products($1,$2::text[])", [
    company,
    [],
  ]);
  await assert.rejects(
    () => submit("customer-create", 5),
    /product_not_purchased/,
  );
  assert.equal(
    (
      await db.query<{ revision: number }>(
        "select revision from public.sv_workspaces where company_id=$1",
        [company],
      )
    ).rows[0].revision,
    5,
  );
  await db.exec("reset role");
});
test("expired, future and suspended purchases cannot write; public clients cannot grant products", async () => {
  const company = "44444444-4444-4444-8444-444444444444";
  await db.exec("set role service_role");
  await db.query(
    "select public.sv_provision_company($1,$2,$3,$4,$5::jsonb,$6::text[])",
    [
      company,
      "POS-only",
      ua,
      "Owner",
      JSON.stringify(state(company, ua)),
      ["pos"],
    ],
  );
  const submit = () =>
    db.query("select public.sv_commit_workspace($1,$2,$3,$4,$5::jsonb,$6)", [
      company,
      ua,
      0,
      randomUUID(),
      JSON.stringify(state(company, ua)),
      "pos",
    ]);
  await db.query(
    "update public.sv_company_products set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' where company_id=$1",
    [company],
  );
  await assert.rejects(submit, /product_not_purchased/);
  await db.query(
    "update public.sv_company_products set ends_at=null,starts_at=now()+interval '1 day' where company_id=$1",
    [company],
  );
  await assert.rejects(submit, /product_not_purchased/);
  await db.query(
    "update public.sv_company_products set starts_at=now(),status='suspended' where company_id=$1",
    [company],
  );
  await assert.rejects(submit, /product_not_purchased/);
  await assert.rejects(
    () =>
      db.query("select public.sv_set_company_products($1,$2::text[])", [
        company,
        ["unknown"],
      ]),
    /invalid_products/,
  );
  await db.exec("reset role");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(
      () =>
        db.query("select public.sv_set_company_products($1,$2::text[])", [
          company,
          ["crm", "pos"],
        ]),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("select * from public.sv_company_products"),
      /permission denied/,
    );
    await db.exec("reset role");
  }
});
