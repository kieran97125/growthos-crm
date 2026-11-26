import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("privileged sessions require the registered owner's live verified authenticator", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      create schema auth;
      create table auth.users (id uuid primary key);
      create table auth.sessions (id uuid primary key, user_id uuid, factor_id uuid, aal text, not_after timestamptz);
      create table auth.mfa_factors (id uuid primary key, user_id uuid, factor_type text, status text);
    `);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261126083218_convelta_trusted_mfa_sessions.sql",
        "utf8",
      ),
    );
    const user = randomUUID(),
      otherUser = randomUUID(),
      session = randomUUID(),
      factor = randomUUID();
    const trusted = async (userId = user) => {
      const result = await db.query<{ allowed: boolean }>(
        "select public.sv_trusted_mfa_session($1, $2) as allowed",
        [userId, session],
      );
      return result.rows[0].allowed;
    };
    await db.query("insert into auth.users values ($1), ($2)", [
      user,
      otherUser,
    ]);
    await db.query(
      "insert into auth.mfa_factors values ($1,$2,'totp','verified')",
      [factor, user],
    );
    await db.query("insert into auth.sessions values ($1,$2,$3,'aal2',null)", [
      session,
      user,
      factor,
    ]);
    assert.equal(await trusted(), false);
    await db.exec("set role service_role");
    await db.query(
      "insert into public.sv_trusted_mfa_factors(user_id, factor_id) values ($1,$2)",
      [user, factor],
    );
    assert.equal(await trusted(), true);
    assert.equal(await trusted(otherUser), false);
    await assert.rejects(
      db.query("update public.sv_trusted_mfa_factors set factor_id=$1", [
        randomUUID(),
      ]),
      /permission denied/,
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec("reset role; set role " + role);
      await assert.rejects(trusted(), /permission denied/);
      await assert.rejects(
        db.query("select * from public.sv_trusted_mfa_factors"),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "insert into public.sv_trusted_mfa_factors(user_id,factor_id) values ($1,$2)",
          [otherUser, randomUUID()],
        ),
        /permission denied/,
      );
    }
    await db.exec("reset role");
    for (const scenario of [
      "update auth.sessions set aal='aal1'",
      "update auth.sessions set factor_id=null",
      "update auth.sessions set not_after=now()-interval '1 hour'",
      "update auth.mfa_factors set status='unverified'",
      "update auth.mfa_factors set factor_type='phone'",
      "delete from auth.sessions",
      "delete from auth.mfa_factors",
    ]) {
      await db.exec("begin");
      await db.exec(scenario);
      assert.equal(await trusted(), false);
      await db.exec("rollback");
    }
  } finally {
    await db.close();
  }
});
