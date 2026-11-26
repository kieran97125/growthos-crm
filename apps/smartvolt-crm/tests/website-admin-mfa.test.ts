import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  "supabase/migrations/20261126083248_convelta_website_admin_trusted_mfa.sql",
  "utf8",
);

test("CRM-only installations keep the website module optional", async () => {
  const db = new PGlite();
  try {
    await db.exec(migration);
    const { rows } = await db.query<{ absent: boolean }>(
      "select to_regprocedure('public.sv_website_admin_access()') is null as absent",
    );
    assert.equal(rows[0].absent, true);
    await db.exec(`
      create function public.sv_update_website_enquiry(uuid,bigint,text,text)
      returns jsonb language sql as $$select '{}'::jsonb$$;
    `);
    await assert.rejects(
      db.exec(migration),
      /missing its administrative access predicate/,
    );
  } finally {
    await db.close();
  }
});

test("website administration requires the tenant owner and a trusted AAL2 session", async () => {
  const db = new PGlite();
  const company = randomUUID();
  const owner = randomUUID();
  const otherCompany = randomUUID();
  const otherOwner = randomUUID();
  const agent = randomUUID();
  const ownerSession = randomUUID();
  const otherSession = randomUUID();
  const agentSession = randomUUID();
  const claims = {
    sub: owner,
    session_id: ownerSession,
    role: "authenticated",
    aal: "aal2",
  };

  async function access(overrides: Record<string, unknown> = {}) {
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ ...claims, ...overrides }),
    ]);
    const { rows } = await db.query<{ allowed: boolean }>(
      "select public.sv_website_admin_access() as allowed",
    );
    return rows[0].allowed;
  }

  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create role service_role;
      create schema auth;
      create schema website_private;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key, user_id uuid, factor_id uuid, aal text, not_after timestamptz);
      create table auth.mfa_factors(id uuid primary key, user_id uuid, factor_type text, status text);
      create function auth.jwt() returns jsonb language sql stable as
        $$select nullif(current_setting('request.jwt.claims', true), '')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as
        $$select (auth.jwt()->>'sub')::uuid$$;
      create table public.sv_companies(id uuid primary key, status text);
      create table public.sv_memberships(company_id uuid, user_id uuid, status text, role text);
      create table website_private.intake_settings(company_id uuid, singleton boolean, active boolean);
      create function public.sv_website_admin_access() returns boolean
        language sql stable security definer set search_path='' as $$select true$$;
      revoke all on function public.sv_website_admin_access() from public;
      grant execute on function public.sv_website_admin_access() to authenticated;
    `);
    await db.query(
      "insert into public.sv_companies values ($1,'active'),($2,'active')",
      [company, otherCompany],
    );
    await db.query(
      "insert into website_private.intake_settings values ($1,true,true)",
      [company],
    );
    await db.query(
      `
      insert into public.sv_memberships values
      ($1,$2,'active','owner'), ($3,$4,'active','owner'), ($1,$5,'active','agent')
    `,
      [company, owner, otherCompany, otherOwner, agent],
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261126083218_convelta_trusted_mfa_sessions.sql",
        "utf8",
      ),
    );
    for (const [user, session] of [
      [owner, ownerSession],
      [otherOwner, otherSession],
      [agent, agentSession],
    ]) {
      const factor = randomUUID();
      await db.query("insert into auth.users values ($1)", [user]);
      await db.query(
        "insert into auth.mfa_factors values ($1,$2,'totp','verified')",
        [factor, user],
      );
      await db.query(
        "insert into auth.sessions values ($1,$2,$3,'aal2',null)",
        [session, user, factor],
      );
      await db.query(
        "insert into public.sv_trusted_mfa_factors(user_id, factor_id) values ($1,$2)",
        [user, factor],
      );
    }
    await db.exec(migration);
    await db.exec("set role anon");
    await assert.rejects(access(), /permission denied/);
    await db.exec("set role authenticated");
    assert.equal(await access(), true);
    assert.equal(await access({ aal: "aal1" }), false);
    assert.equal(await access({ aal: null }), false);
    assert.equal(await access({ sub: null }), false);
    assert.equal(await access({ role: "service_role" }), false);
    assert.equal(await access({ session_id: null }), false);
    assert.equal(await access({ session_id: "invalid" }), false);
    assert.equal(await access({ session_id: randomUUID() }), false);
    assert.equal(await access({ session_id: otherSession }), false);
    assert.equal(
      await access({ sub: otherOwner, session_id: otherSession }),
      false,
    );
    assert.equal(await access({ sub: agent, session_id: agentSession }), false);
    await db.exec(
      "reset role; update website_private.intake_settings set active=false; set role authenticated",
    );
    assert.equal(await access(), false);
    await db.exec(
      "reset role; update website_private.intake_settings set active=true; update public.sv_memberships set status='suspended'; set role authenticated",
    );
    assert.equal(await access(), false);
  } finally {
    await db.close();
  }
});
