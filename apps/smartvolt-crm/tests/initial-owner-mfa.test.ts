import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("only existing owners can finish registration while retaining access, and pairing consumes the exception", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema smartvolt_private; create table auth.users(id uuid primary key);
      create table public.sv_companies(id uuid primary key, status text);
      create table public.sv_memberships(company_id uuid, user_id uuid, role text, status text, primary key(company_id,user_id));
    `);
    const [owner, removedOwner, manager, newOwner, company, newCompany] =
      Array.from({ length: 6 }, () => randomUUID());
    const run = (path: string) =>
      db.exec(readFileSync("supabase/migrations/" + path, "utf8"));
    const addMember = (id: string, role: string, companyId = company) =>
      db.query("insert into public.sv_memberships values ($1,$2,$3,'active')", [
        companyId,
        id,
        role,
      ]);
    const pending = async (id: string) =>
      (
        await db.query<{ pending: boolean }>(
          "select public.sv_mfa_enrollment_pending($1) as pending",
          [id],
        )
      ).rows[0].pending;
    await db.query("insert into auth.users values ($1),($2),($3),($4)", [
      owner,
      removedOwner,
      manager,
      newOwner,
    ]);
    await db.query(
      "insert into public.sv_companies values ($1,'active'),($2,'active')",
      [company, newCompany],
    );
    await addMember(owner, "owner");
    await addMember(removedOwner, "owner");
    await addMember(manager, "manager");
    await run("20261126083218_convelta_trusted_mfa_sessions.sql");
    await run("20261126085228_convelta_existing_owner_enrollment.sql");
    await addMember(newOwner, "owner");
    assert.equal(await pending(owner), true);
    assert.equal(await pending(manager), false);
    assert.equal(await pending(newOwner), false);
    await addMember(owner, "manager", newCompany);
    assert.equal(await pending(owner), false);
    await db.query(
      "delete from public.sv_memberships where company_id=$1 and user_id=$2",
      [newCompany, owner],
    );
    await db.query(
      "update public.sv_memberships set status='suspended' where user_id=$1",
      [removedOwner],
    );
    await db.query(
      "update public.sv_memberships set status='active' where user_id=$1",
      [removedOwner],
    );
    assert.equal(await pending(removedOwner), false);
    assert.equal(await pending(owner), true);
    await db.exec("set role service_role");
    await db.query(
      "insert into public.sv_trusted_mfa_factors(user_id, factor_id) values ($1,$2)",
      [owner, randomUUID()],
    );
    assert.equal(await pending(owner), false);
    await db.exec("reset role");
    await db.query(
      "delete from public.sv_trusted_mfa_factors where user_id=$1",
      [owner],
    );
    assert.equal(await pending(owner), false);
    await db.exec("set role authenticated");
    await assert.rejects(pending(owner), /permission denied/);
  } finally {
    await db.close();
  }
});
