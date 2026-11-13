import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  createCompanyState,
  applyCompanyCommand,
} from "../src/lib/saas/workspace";
import {
  parseLedgerQuery,
  ledgerRpcArgs,
  ledgerCursor,
  ledgerPageSchema,
} from "../src/lib/pos/ledger-query";

const now = Date.parse("2026-11-11T16:30:00Z");
test("ledger filters use Hong Kong midnight and strictly bound dates, size and cursor", () => {
  const query = parseLedgerQuery(new URLSearchParams(), now);
  assert.equal(query.to, "2026-11-12");
  assert.equal(query.fromAt, Date.parse("2026-10-31T16:00:00Z"));
  assert.equal(query.toAt, Date.parse("2026-11-12T16:00:00Z"));
  for (const value of [
    "from=2026-02-30",
    "from=2026-12-01&to=2026-11-01",
    "from=2020-01-01",
    "limit=0",
    "limit=101",
    "limit=1e2",
    "cursor=%%%",
    `cursor=${Buffer.from("{}").toString("base64url")}`,
  ])
    assert.throws(() => parseLedgerQuery(new URLSearchParams(value), now));
  const cursor = Buffer.from(
    JSON.stringify({ at: now, id: "same-time-order" }),
  ).toString("base64url");
  const scoped = parseLedgerQuery(
    new URLSearchParams({ brand: "main", limit: "1", cursor }),
    now,
  );
  const args = ledgerRpcArgs("company", "actor", scoped);
  assert.equal(args.p_company, "company");
  assert.equal(args.p_actor, "actor");
  assert.equal(args.p_before_id, "same-time-order");
});

const db = new PGlite();
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const foreign = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const company = "11111111-1111-4111-8111-111111111111";
const otherCompany = "22222222-2222-4222-8222-222222222222";
before(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth,public to authenticated,service_role; grant execute on function auth.uid() to authenticated;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query("insert into auth.users values($1),($2)", [owner, foreign]);
  await db.exec("set role service_role");
  for (const [id, user] of [
    [company, owner],
    [otherCompany, foreign],
  ]) {
    const actor = { id: user, name: "Owner", role: "owner" as const };
    let state = createCompanyState({
      companyId: id,
      companyName: "Isolated test",
      brands: [
        { id: "main", name: "Main", short: "M" },
        { id: "second", name: "Second", short: "S" },
      ],
      team: [{ id: user, name: "Owner", initials: "O" }],
    });
    state = applyCompanyCommand(
      state,
      {
        type: "customer-create",
        id: "contact",
        brandId: "main",
        name: "Test",
        phone: "91234567",
        at: now,
      },
      actor,
      now,
      ["pos"],
    );
    state.inbox.conversations.push({
      ...state.inbox.conversations[0],
      id: "second-contact-context",
      brandId: "second",
    });
    for (const brandId of ["main", "second"])
      state.pos!.catalog.push({
        id: `${brandId}-item`,
        brandId,
        name: "Test service",
        category: "Service",
        kind: "service",
        priceCents: 10000,
        durationMinutes: 60,
        bufferMinutes: 0,
        resourceKind: "none",
        serviceId: null,
        units: 1,
        validDays: 30,
        active: true,
      });
    for (const [orderId, brand] of [
      ["a", "main"],
      ["b", "main"],
      ["c", "second"],
    ]) {
      state = applyCompanyCommand(
        state,
        {
          type: "pos",
          command: {
            kind: "cart-add",
            id: randomUUID(),
            orderId,
            contactId: state.inbox.contacts[0].id,
            itemId: `${brand}-item`,
            appointmentId: null,
          },
        },
        actor,
        now,
        ["pos"],
      );
      state = applyCompanyCommand(
        state,
        {
          type: "pos",
          command: {
            kind: "payment-record",
            id: randomUUID(),
            orderId,
            amountCents: 10000,
            method: "cash",
            reference: "",
          },
        },
        actor,
        now + 86_400_000 * 40,
        ["pos"],
      );
    }
    state = applyCompanyCommand(
      state,
      {
        type: "pos",
        command: {
          kind: "refund-record",
          id: randomUUID(),
          orderId: "a",
          amountCents: 1000,
          reason: "Test correction",
        },
      },
      actor,
      now + 86_400_000 * 41,
      ["pos"],
    );
    await db.query(
      "select public.sv_provision_company($1,$2,$3,$4,$5::jsonb,$6::text[])",
      [id, "Isolated test", user, "Owner", JSON.stringify(state), ["pos"]],
    );
  }
});
after(async () => {
  await db.close();
});
async function read(params = new URLSearchParams(), actor = owner) {
  const q = parseLedgerQuery(params, now);
  const args = ledgerRpcArgs(company, actor, q);
  const { rows } = await db.query<{ data: unknown }>(
    "select public.sv_read_pos_ledger($1,$2,$3,$4,$5,$6,$7,$8) data",
    [
      args.p_company,
      args.p_actor,
      args.p_brand,
      args.p_from,
      args.p_to,
      args.p_limit,
      args.p_before_at,
      args.p_before_id,
    ],
  );
  return ledgerPageSchema.parse(rows[0].data);
}
test("ledger keyset handles tied timestamps; totals are cohort-wide and include later registered receipts/refunds", async () => {
  const first = await read(new URLSearchParams({ limit: "1" }));
  assert.equal(first.rows[0].id, "c");
  assert.deepEqual(first.totals, {
    orders: 3,
    orderedCents: 30000,
    paidCents: 30000,
    refundedCents: 1000,
    netCents: 29000,
  });
  const second = await read(
    new URLSearchParams({ limit: "1", cursor: ledgerCursor(first)! }),
  );
  const third = await read(
    new URLSearchParams({ limit: "1", cursor: ledgerCursor(second)! }),
  );
  assert.deepEqual(
    [first, second, third].flatMap((p) => p.rows.map((r) => r.id)),
    ["c", "b", "a"],
  );
  assert.deepEqual(third.totals, first.totals);
  assert.equal(third.rows[0].netCents, 9000);
  assert.equal(ledgerCursor(third), null);
  assert.ok(!JSON.stringify(first).includes("contact"));
  assert.ok(!JSON.stringify(first).includes("snapshot"));
  const brand = await read(new URLSearchParams({ brand: "main" }));
  assert.deepEqual(
    brand.rows.map((r) => r.id),
    ["b", "a"],
  );
  assert.equal(brand.totals.orders, 2);
  const empty = await read(
    new URLSearchParams({ from: "2026-11-01", to: "2026-11-10" }),
  );
  assert.equal(empty.totals.orders, 0);
  assert.equal(empty.hasMore, false);
});
test("ledger rechecks membership, suspension and purchased POS inside PostgreSQL; browser RPC remains private", async () => {
  await assert.rejects(
    () => read(new URLSearchParams(), foreign),
    /access_denied/,
  );
  await db.query(
    "update public.sv_memberships set status='suspended' where company_id=$1",
    [company],
  );
  await assert.rejects(() => read(), /access_denied/);
  await db.query(
    "update public.sv_memberships set status='active' where company_id=$1",
    [company],
  );
  await db.query("select public.sv_set_company_products($1,$2::text[])", [
    company,
    ["crm"],
  ]);
  await assert.rejects(() => read(), /product_not_purchased/);
  await db.query("select public.sv_set_company_products($1,$2::text[])", [
    company,
    ["pos"],
  ]);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role; set role ${role}`);
    await assert.rejects(() => read(), /permission denied/);
  }
  await db.exec("reset role; set role service_role");
  await assert.rejects(
    () =>
      db.query(
        "select public.sv_read_pos_ledger($1,$2,null,0,1,101,null,null)",
        [company, owner],
      ),
    /invalid_ledger_filter/,
  );
});
