import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  createCompanyState,
  applyCompanyCommand,
} from "../src/lib/saas/workspace";
import type { AppState } from "../src/lib/demo/state";
import type { PosCommand, CatalogItem } from "../src/lib/pos/model";
const db = new PGlite();
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor = { id: owner, name: "Owner", role: "owner" as const };
const now = 1794358800000;
const migrationFiles = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort();
before(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth,public to authenticated,service_role; grant execute on function auth.uid() to authenticated; alter default privileges grant all on tables to service_role;",
  );
  for (const file of migrationFiles)
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query("insert into auth.users values($1)", [owner]);
  await db.exec("set role service_role");
});
after(async () => {
  await db.close();
});
const service: CatalogItem = {
  id: "service",
  brandId: "main",
  name: "Service",
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
};
const packageItem: CatalogItem = {
  ...service,
  id: "package",
  name: "Three services",
  kind: "package",
  priceCents: 24000,
  durationMinutes: 0,
  serviceId: service.id,
  units: 3,
};
type Fixture = { id: string; state: AppState; revision: number };
async function fixture(): Promise<Fixture> {
  const id = randomUUID();
  let state = createCompanyState({
    companyId: id,
    companyName: "Test company",
    brands: [{ id: "main", name: "Main", short: "MAIN" }],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
  state = applyCompanyCommand(
    state,
    {
      type: "customer-create",
      id: "customer",
      brandId: "main",
      name: "Customer",
      phone: "91234567",
      at: now,
    },
    actor,
    now,
    ["crm", "pos"],
  );
  for (const item of [service, packageItem])
    state = applyCompanyCommand(
      state,
      {
        type: "pos",
        command: { kind: "catalog-save", id: randomUUID(), item },
      },
      actor,
      now,
      ["crm", "pos"],
    );
  await db.query(
    "select public.sv_provision_company($1,$2,$3,$4,$5::jsonb,$6::text[])",
    [id, "Test company", owner, "Owner", JSON.stringify(state), ["crm", "pos"]],
  );
  return { id, state, revision: 0 };
}
function reduce(f: Fixture, c: PosCommand) {
  return applyCompanyCommand(f.state, { type: "pos", command: c }, actor, now, [
    "crm",
    "pos",
  ]);
}
async function commit(
  f: Fixture,
  state: AppState,
  commandId = randomUUID(),
  kind = "pos",
) {
  const r = await db.query<{ sv_commit_workspace: { revision: number } }>(
    "select public.sv_commit_workspace($1,$2,$3,$4,$5::jsonb,$6)",
    [f.id, owner, f.revision, commandId, JSON.stringify(state), kind],
  );
  f.state = state;
  f.revision = Number(r.rows[0].sv_commit_workspace.revision);
  return commandId;
}
async function execute(f: Fixture, c: PosCommand) {
  return commit(f, reduce(f, c));
}
async function cart(
  f: Fixture,
  kind: "service" | "package" = "service",
  orderId = "order",
) {
  const contact = f.state.inbox.contacts[0].id;
  await execute(f, {
    kind: "cart-add",
    id: randomUUID(),
    orderId,
    contactId: contact,
    itemId: kind,
    appointmentId: null,
  });
  return f.state.pos!.orders.find((o) => o.id === orderId)!;
}
async function payment(
  f: Fixture,
  amountCents: number,
  id: string = randomUUID(),
  orderId = "order",
) {
  await execute(f, {
    kind: "payment-record",
    id,
    orderId,
    amountCents,
    method: "fps",
    reference: "Verified reference",
  });
}
async function counts(f: Fixture) {
  return (
    await db.query<{
      revision: number;
      payments: number;
      refunds: number;
      redemptions: number;
      versions: number;
      commands: number;
    }>(
      `select w.revision,
  (select count(*)::integer from public.sv_pos_payments where company_id=w.company_id) payments,
  (select count(*)::integer from public.sv_pos_refunds where company_id=w.company_id) refunds,
  (select count(*)::integer from public.sv_pos_redemptions where company_id=w.company_id) redemptions,
  (select count(*)::integer from public.sv_workspace_versions where company_id=w.company_id) versions,
  (select count(*)::integer from public.sv_commands where company_id=w.company_id) commands
  from public.sv_workspaces w where company_id=$1`,
      [f.id],
    )
  ).rows[0];
}
async function consumedPackage(f: Fixture) {
  await cart(f, "package");
  await payment(f, 24000);
  const contact = f.state.inbox.contacts[0].id;
  await execute(f, {
    kind: "appointment-save",
    id: randomUUID(),
    appointmentId: "visit",
    contactId: contact,
    serviceId: "service",
    staffId: owner,
    resourceId: null,
    startsAt: now + 3600000,
    guests: 1,
    note: "",
    status: "confirmed",
  });
  await execute(f, {
    kind: "appointment-status",
    id: randomUUID(),
    appointmentId: "visit",
    status: "checked_in",
  });
  const entitlement = f.state.pos!.entitlements[0];
  const redemptionId = randomUUID();
  await execute(f, {
    kind: "package-redeem",
    id: redemptionId,
    entitlementId: entitlement.id,
    appointmentId: "visit",
  });
  return { entitlement, redemptionId };
}

test("ledger tables enable RLS and browser roles cannot read money or execute private helpers", async () => {
  const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
    "select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname like 'sv_pos_%' and relkind='r'",
  );
  assert.equal(rows.length, 7);
  assert.ok(rows.every((r) => r.relrowsecurity));
  for (const table of rows)
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select has_table_privilege('service_role',$1,'TRUNCATE') allowed",
          [`public.${table.relname}`],
        )
      ).rows[0].allowed,
      false,
    );
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role;set role ${role}`);
    for (const table of rows)
      await assert.rejects(
        () => db.query(`select * from public.${table.relname}`),
        /permission denied/,
      );
    await assert.rejects(
      () => db.query("select smartvolt_private.project_pos_ledger()"),
      /permission denied/,
    );
  }
  await db.exec("reset role;set role service_role");
});
test("unpaid cart changes retain ordered snapshots, including a return to previous terms", async () => {
  const f = await fixture();
  const order = await cart(f);
  await execute(f, {
    kind: "cart-quantity",
    id: randomUUID(),
    orderId: order.id,
    lineId: order.lines[0].id,
    quantity: 2,
  });
  await execute(f, {
    kind: "cart-quantity",
    id: randomUUID(),
    orderId: order.id,
    lineId: order.lines[0].id,
    quantity: 1,
  });
  const { rows } = await db.query<{
    workspace_revision: number;
    snapshot: { lines: { quantity: number }[] };
  }>(
    "select workspace_revision,snapshot from public.sv_pos_order_versions where company_id=$1 order by workspace_revision",
    [f.id],
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.snapshot.lines[0].quantity),
    [1, 2, 1],
  );
  assert.equal(
    Number(
      (
        await db.query<{ total_cents: number }>(
          "select total_cents from public.sv_pos_orders where company_id=$1",
          [f.id],
        )
      ).rows[0].total_cents,
    ),
    10000,
  );
});
test("a first deposit freezes order terms; invalid change rolls back revision, recovery history and ledger", async () => {
  const f = await fixture();
  await cart(f);
  await payment(f, 2000);
  const before = await counts(f);
  const changed = structuredClone(f.state);
  changed.pos!.orders[0].lines[0].unitCents = 12000;
  await assert.rejects(() => commit(f, changed), /pos_paid_order_immutable/);
  assert.deepEqual(await counts(f), before);
  await assert.rejects(
    () =>
      db.query(
        "update public.sv_pos_orders set total_cents=11000,subtotal_cents=11000 where company_id=$1",
        [f.id],
      ),
    /pos_paid_order_immutable/,
  );
  await assert.rejects(
    () =>
      db.query(
        "update public.sv_pos_orders set contact_id='other' where company_id=$1",
        [f.id],
      ),
    /pos_paid_order_immutable/,
  );
  await payment(f, 8000);
  assert.equal((await counts(f)).payments, 2);
});
test("command replay has one payment and one command; same local order IDs stay company-scoped", async () => {
  const a = await fixture(),
    b = await fixture();
  await cart(a);
  await cart(b);
  const next = reduce(a, {
    kind: "payment-record",
    id: "payment",
    orderId: "order",
    amountCents: 10000,
    method: "cash",
    reference: "",
  });
  const previousRevision = a.revision;
  const commandId = await commit(a, next);
  await db.query(
    "select public.sv_commit_workspace($1,$2,$3,$4,$5::jsonb,$6)",
    [a.id, owner, previousRevision, commandId, JSON.stringify(next), "pos"],
  );
  await payment(b, 10000, "payment");
  assert.equal((await counts(a)).payments, 1);
  assert.equal((await counts(b)).payments, 1);
  const other = structuredClone(b.state);
  other.pos!.payments.push({
    ...other.pos!.payments[0],
    id: "foreign",
    orderId: "only-in-another-company",
  });
  await assert.rejects(() => commit(b, other), /foreign key/);
});
test("money evidence cannot be edited, dropped, or removed by dropping POS; direct row rewrites are denied", async () => {
  const f = await fixture();
  await cart(f);
  await payment(f, 10000);
  const before = await counts(f);
  for (const change of [
    (s: AppState) => {
      s.pos!.payments = [];
    },
    (s: AppState) => {
      s.pos!.payments[0].amountCents = 1;
    },
    (s: AppState) => {
      delete s.pos;
    },
  ]) {
    const next = structuredClone(f.state);
    change(next);
    await assert.rejects(() => commit(f, next), /pos_ledger_evidence/);
    assert.deepEqual(await counts(f), before);
  }
  await assert.rejects(
    () =>
      db.query(
        "update public.sv_pos_payments set amount_cents=1 where company_id=$1",
        [f.id],
      ),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      db.query("delete from public.sv_pos_payments where company_id=$1", [
        f.id,
      ]),
    /permission denied/,
  );
});
test("overpayment and over-refund fail atomically; refund closes a deposit against further collection", async () => {
  const f = await fixture();
  await cart(f);
  await payment(f, 2000);
  const before = await counts(f);
  const overpaid = structuredClone(f.state);
  overpaid.pos!.payments.push({
    ...overpaid.pos!.payments[0],
    id: "overpaid",
    amountCents: 9000,
  });
  await assert.rejects(() => commit(f, overpaid), /pos_ledger_invalid_balance/);
  assert.deepEqual(await counts(f), before);
  const overRefund = structuredClone(f.state);
  overRefund.pos!.refunds.push({
    id: "overrefund",
    orderId: "order",
    amountCents: 2001,
    reason: "Correction",
    at: now,
    actor: "Owner",
    source: "manual_verified",
  });
  await assert.rejects(
    () => commit(f, overRefund),
    /pos_ledger_invalid_balance/,
  );
  assert.deepEqual(await counts(f), before);
  await execute(f, {
    kind: "refund-record",
    id: randomUUID(),
    orderId: "order",
    amountCents: 1000,
    reason: "Partial deposit correction",
  });
  const reopened = structuredClone(f.state);
  reopened.pos!.payments.push({
    ...reopened.pos!.payments[0],
    id: "reopen",
    amountCents: 1000,
  });
  await assert.rejects(() => commit(f, reopened), /pos_refunded_order_closed/);
});
test("paid package terms survive catalog edits and consumption/reversal/refund preserves immutable evidence", async () => {
  const f = await fixture();
  const { entitlement, redemptionId } = await consumedPackage(f);
  await execute(f, {
    kind: "catalog-save",
    id: randomUUID(),
    item: {
      ...packageItem,
      name: "New offer",
      priceCents: 28000,
      units: 6,
      validDays: 60,
    },
  });
  assert.equal(
    (
      await db.query<{ units: number }>(
        "select units from public.sv_pos_entitlements where company_id=$1",
        [f.id],
      )
    ).rows[0].units,
    3,
  );
  const revoked = structuredClone(f.state);
  revoked.pos!.entitlements[0].revoked = true;
  await assert.rejects(
    () => commit(f, revoked),
    /pos_ledger_entitlement_purchase/,
  );
  await execute(f, {
    kind: "redemption-reverse",
    id: randomUUID(),
    redemptionId,
    reason: "Correct visit",
  });
  await execute(f, {
    kind: "refund-record",
    id: randomUUID(),
    orderId: "order",
    amountCents: 24000,
    reason: "Full refund after correction",
  });
  const rows = (
    await db.query<{ delta: number }>(
      "select delta from public.sv_pos_redemptions where company_id=$1 order by delta",
      [f.id],
    )
  ).rows;
  assert.deepEqual(
    rows.map((r) => r.delta),
    [-1, 1],
  );
  assert.equal((await counts(f)).refunds, 1);
  const unrevoked = structuredClone(f.state);
  unrevoked.pos!.entitlements[0].revoked = false;
  await assert.rejects(
    () => commit(f, unrevoked),
    /pos_ledger_entitlement_purchase|pos_entitlement_terms_immutable/,
  );
  await assert.rejects(
    () =>
      db.query(
        "update public.sv_pos_entitlements set units=100 where company_id=$1",
        [f.id],
      ),
    /pos_entitlement_terms_immutable/,
  );
  await assert.rejects(
    () =>
      db.query(
        "update public.sv_pos_entitlements set expires_at=expires_at+1000 where company_id=$1",
        [f.id],
      ),
    /pos_entitlement_terms_immutable/,
  );
  assert.equal(entitlement.units, 3);
});
test("redemption scope, duplicate correction and overconsumption are rejected without changing history", async () => {
  const f = await fixture();
  const { redemptionId } = await consumedPackage(f);
  const before = await counts(f);
  const double = structuredClone(f.state);
  double.pos!.redemptions.push({ ...double.pos!.redemptions[0], id: "double" });
  await assert.rejects(
    () => commit(f, double),
    /pos_ledger_appointment_redeemed_twice/,
  );
  assert.deepEqual(await counts(f), before);
  const missing = structuredClone(f.state);
  missing.pos!.redemptions[0].appointmentId = "foreign-visit";
  await assert.rejects(() => commit(f, missing), /pos_ledger_evidence/);
  await execute(f, {
    kind: "redemption-reverse",
    id: randomUUID(),
    redemptionId,
    reason: "Correction",
  });
  const twice = structuredClone(f.state);
  twice.pos!.redemptions.push({
    ...twice.pos!.redemptions.find((r) => r.delta === 1)!,
    id: "reverse-twice",
  });
  await assert.rejects(() => commit(f, twice), /unique constraint/);
});

test("distinct visits cannot overdraw package units and newly appended expired consumption is refused", async () => {
  const f = await fixture();
  await consumedPackage(f);
  const before = await counts(f);
  const overdrawn = structuredClone(f.state);
  const visit = overdrawn.pos!.appointments[0],
    original = overdrawn.pos!.redemptions[0];
  for (let i = 0; i < 3; i++) {
    overdrawn.pos!.appointments.push({
      ...visit,
      id: `extra-visit-${i}`,
      crmBookingId: `extra-book-${i}`,
    });
    overdrawn.pos!.redemptions.push({
      ...original,
      id: `extra-${i}`,
      appointmentId: `extra-visit-${i}`,
    });
  }
  await assert.rejects(
    () => commit(f, overdrawn),
    /pos_ledger_invalid_package_balance/,
  );
  assert.deepEqual(await counts(f), before);
  const expired = structuredClone(f.state);
  expired.pos!.appointments.push({
    ...visit,
    id: "expired-visit",
    crmBookingId: "expired-book",
  });
  expired.pos!.redemptions.push({
    ...original,
    id: "expired",
    appointmentId: "expired-visit",
    at: expired.pos!.entitlements[0].expiresAt,
  });
  await assert.rejects(
    () => commit(f, expired),
    /pos_ledger_redemption_unavailable/,
  );
  assert.deepEqual(await counts(f), before);
});

test("installation backfills existing corrected package history without advancing revision or duplicating evidence", async () => {
  const f = await fixture();
  const { redemptionId } = await consumedPackage(f);
  await execute(f, {
    kind: "redemption-reverse",
    id: randomUUID(),
    redemptionId,
    reason: "Historical correction",
  });
  await execute(f, {
    kind: "refund-record",
    id: randomUUID(),
    orderId: "order",
    amountCents: 24000,
    reason: "Historical refund",
  });
  const backfill = new PGlite();
  try {
    await backfill.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,service_role;",
    );
    for (const file of migrationFiles.filter(
      (f) =>
        f <
        migrationFiles.find((x) =>
          x.endsWith("smartvolt_pos_immutable_ledger.sql"),
        )!,
    ))
      await backfill.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await backfill.query("insert into auth.users values($1)", [owner]);
    await backfill.query(
      "select public.sv_provision_company($1,$2,$3,$4,$5::jsonb,$6::text[])",
      [
        f.id,
        "Historical company",
        owner,
        "Owner",
        JSON.stringify(f.state),
        ["crm", "pos"],
      ],
    );
    await backfill.query(
      "update public.sv_workspaces set revision=$2 where company_id=$1",
      [f.id, f.revision],
    );
    const migration = migrationFiles.find((f) =>
      f.endsWith("smartvolt_pos_immutable_ledger.sql"),
    )!;
    await backfill.exec(
      readFileSync(`supabase/migrations/${migration}`, "utf8"),
    );
    for (const later of migrationFiles.filter((f) => f > migration))
      await backfill.exec(readFileSync(`supabase/migrations/${later}`, "utf8"));
    assert.equal(
      Number(
        (
          await backfill.query<{ revision: number }>(
            "select revision from public.sv_workspaces where company_id=$1",
            [f.id],
          )
        ).rows[0].revision,
      ),
      f.revision,
    );
    assert.equal(
      (
        await backfill.query(
          "select * from public.sv_pos_redemptions where company_id=$1",
          [f.id],
        )
      ).rows.length,
      2,
    );
    assert.equal(
      (
        await backfill.query(
          "select * from public.sv_pos_refunds where company_id=$1",
          [f.id],
        )
      ).rows.length,
      1,
    );
    await backfill.exec("update public.sv_workspaces set payload=payload");
    assert.equal(
      (
        await backfill.query(
          "select * from public.sv_pos_payments where company_id=$1",
          [f.id],
        )
      ).rows.length,
      1,
    );
  } finally {
    await backfill.close();
  }
});

test("referenced appointment identity stays immutable while status/schedule read models remain mutable", async () => {
  const f = await fixture();
  await consumedPackage(f);
  const before = await counts(f);
  await assert.rejects(
    () =>
      db.query(
        "update public.sv_pos_appointments set service_id='foreign-service' where company_id=$1",
        [f.id],
      ),
    /pos_ledger_appointment_identity_immutable/,
  );
  const changed = structuredClone(f.state);
  changed.pos!.appointments[0].contactId = "another-customer";
  await assert.rejects(
    () => commit(f, changed),
    /pos_ledger_customer_scope|pos_ledger_appointment_identity_immutable/,
  );
  assert.deepEqual(await counts(f), before);
});
