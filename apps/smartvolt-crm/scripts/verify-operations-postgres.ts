// This runs only against a disposable, empty GitHub Actions PostgreSQL service.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createCompanyState } from "../src/lib/saas/workspace";
import { defaultSettings } from "../src/lib/operations/model";
if (
  process.env.CI !== "true" ||
  process.env.PGHOST !== "127.0.0.1" ||
  process.env.PGDATABASE !== "convelta_operations"
)
  throw new Error("Native verification requires its isolated CI database.");
const args = ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"],
  quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
function execute(input: string) {
  const child = spawn("psql", args, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "",
    error = "";
  child.stdout.on("data", (part) => {
    output += part;
  });
  child.stderr.on("data", (part) => {
    error += part;
  });
  const done = new Promise<string>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error(error || "Native database verification failed.")),
    );
  });
  child.stdin.end(input);
  return { child, done };
}
async function sql(query: string) {
  return execute("set role service_role;set statement_timeout='5s';" + query)
    .done;
}
async function json<T>(query: string): Promise<T> {
  return JSON.parse(await sql(query));
}
async function main() {
  const empty = await execute(
    "select count(*)from information_schema.tables where table_schema='public';",
  ).done;
  assert.equal(
    empty,
    "0",
    "Never run test migrations against a populated database.",
  );
  await execute(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,service_role;alter default privileges in schema public grant all on tables to service_role;",
  ).done;
  for (const f of readdirSync("supabase/migrations")
    .filter((s) => s.endsWith(".sql"))
    .sort())
    await execute(readFileSync("supabase/migrations/" + f, "utf8")).done;
  const company = randomUUID(),
    owner = randomUUID(),
    agent = randomUUID(),
    connection = randomUUID();
  await execute(
    `insert into auth.users values(${quote(owner)}),(${quote(agent)});`,
  ).done;
  const state = createCompanyState({
    companyId: company,
    companyName: "Native synthetic",
    brands: [{ id: "main", name: "Main", short: "M" }],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
  await sql(
    `select sv_provision_company(${quote(company)},'Native synthetic',${quote(owner)},'Owner',${quote(JSON.stringify(state))}::jsonb,array['crm','pos']);insert into sv_memberships(company_id,user_id,role,display_name)values(${quote(company)},${quote(agent)},'agent','Agent');`,
  );
  await sql(
    `select sv_meta_save(${quote(company)},${quote(owner)},${quote(JSON.stringify({ id: connection, brandId: "main", channel: "messenger", appId: "90001", pageId: "10001", accountId: "10001", label: "Native synthetic", credentials: { test: true } }))}::jsonb);`,
  );
  let peer = 100000;
  async function inquiry() {
    return sql(
      `insert into sv_meta_threads(company_id,connection_id,peer_id)values(${quote(company)},${quote(connection)},${quote(String(++peer))})returning id;`,
    );
  }
  async function settings(maxOpen: number, method = "least_open") {
    const data = structuredClone(defaultSettings);
    data.routingEnabled = true;
    data.rules = [
      {
        id: randomUUID(),
        name: "Native admission",
        enabled: true,
        brandId: null,
        channel: "all",
        team: "",
        tags: [],
        onlineOnly: true,
        maxOpen,
        method: method as "least_open" | "round_robin",
      },
    ];
    const revision = await sql(
      `select revision from sv_ops_settings where company_id=${quote(company)};`,
    );
    await sql(
      `select sv_ops_action(${quote(company)},${quote(owner)},${quote(randomUUID())},'settings',${quote(JSON.stringify({ revision: Number(revision), data }))}::jsonb);`,
    );
  }
  await sql(
    `insert into sv_agent_routing(company_id,user_id,capacity,presence,seen_at)values(${quote(company)},${quote(owner)},100,'online',now()),(${quote(company)},${quote(agent)},100,'online',now());`,
  );
  await settings(100);
  const locked = await inquiry(),
    other = await inquiry();
  const holder = execute(
    `set role service_role;begin;select id from sv_meta_threads where id=${quote(locked)}for update;\n\\echo OPS_LOCK_HELD\nselect pg_sleep(2);commit;`,
  );
  await new Promise<void>((resolve, reject) => {
    let text = "";
    const timer = setTimeout(
      () => reject(new Error("Native row-lock handshake timed out.")),
      5000,
    );
    holder.child.stdout.on("data", (part) => {
      text += part;
      if (text.includes("OPS_LOCK_HELD")) {
        clearTimeout(timer);
        resolve();
      }
    });
    holder.done.catch(reject);
  });
  const busy = await json<{ queued: boolean; reason: string }>(
    `select sv_inquiry_auto_assign(${quote(company)},${quote(owner)},'meta',${quote(locked)},0,${quote(randomUUID())});`,
  );
  assert.equal(busy.queued, true);
  assert.equal(busy.reason, "busy");
  const catchup = await json<{ assigned: number }>(
    `select sv_ops_route_waiting(${quote(company)},${quote(owner)});`,
  );
  assert.equal(catchup.assigned, 1);
  assert.notEqual(
    await sql(
      `select assignee_id from sv_meta_threads where id=${quote(other)};`,
    ),
    "",
  );
  await holder.done;

  // Simultaneous requests must admit only one conversation into the last slot.
  await sql(
    `update sv_meta_threads set assignee_id=null,revision=0 where company_id=${quote(company)};update sv_agent_routing set paused=(user_id<>${quote(owner)}::uuid)where company_id=${quote(company)};`,
  );
  await settings(1);
  const candidates = [await inquiry(), await inquiry()],
    commands = [randomUUID(), randomUUID()];
  const call = (id: string, command: string) =>
    `select sv_inquiry_auto_assign(${quote(company)},${quote(owner)},'meta',${quote(id)},0,${quote(command)});`;
  const admitted = await Promise.all(
    candidates.map((id, i) =>
      json<{ saved: boolean; queued: boolean }>(call(id, commands[i])),
    ),
  );
  assert.equal(admitted.filter((r) => r.saved).length, 1);
  assert.equal(admitted.filter((r) => r.queued).length, 1);
  assert.equal(
    await sql(
      `select count(*)from sv_meta_threads where company_id=${quote(company)}and assignee_id is not null;`,
    ),
    "1",
  );
  const winner = admitted.findIndex((r) => r.saved);
  assert.deepEqual(
    await json(call(candidates[winner], commands[winner])),
    admitted[winner],
  );

  // Different rows are routed concurrently; the shared round-robin cursor stays fair.
  await sql(
    `update sv_meta_threads set assignee_id=null,revision=0 where company_id=${quote(company)};update sv_agent_routing set paused=false,presence='online',seen_at=now()where company_id=${quote(company)};`,
  );
  await settings(100, "round_robin");
  const round = await Promise.all(Array.from({ length: 12 }, () => inquiry()));
  await Promise.all(round.map((id) => json(call(id, randomUUID()))));
  const loads = await json<{ owner: number; agent: number }>(
    `select json_build_object('owner',count(*)filter(where assignee_id=${quote(owner)}::uuid),'agent',count(*)filter(where assignee_id=${quote(agent)}::uuid))from sv_meta_threads where company_id=${quote(company)};`,
  );
  assert.equal(loads.owner, 6);
  assert.equal(loads.agent, 6);
  console.log(
    "Native PostgreSQL: busy-row skip, queue catch-up, concurrent capacity, receipt replay and round-robin fairness passed.",
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
