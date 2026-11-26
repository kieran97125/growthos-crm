import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { invitationHash } from "../src/lib/team/token";
const company = randomUUID(),
  owner = randomUUID(),
  member = randomUUID();
type User = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  is_anonymous: boolean;
};
class Harness {
  user: User = {
    id: member,
    email: "member@example.invalid",
    email_confirmed_at: new Date().toISOString(),
    is_anonymous: false,
  };
  pairUser = this.user;
  verified = true;
  privileged = false;
  adminApproved = false;
  acceptError: string | null = null;
  claim = true;
  mailError: { code: string } | null = null;
  mailThrows = false;
  calls: { fn: string; args: Record<string, unknown> }[] = [];
  mailCalls = 0;
  cookieCalls = 0;
  updates: unknown[] = [];
  otp: unknown[] = [];
  session = {
    access_token: "synthetic-access-token-12345",
    refresh_token: "synthetic-refresh-token-12345",
  };
  access = {
    company: { id: company, name: "Synthetic" },
    user: { id: owner },
    actor: { id: owner, name: "Owner", role: "owner" },
    products: ["crm"],
    scope: { brands: [{ id: "main", name: "Main" }] },
    db: null as unknown,
  };
  constructor() {
    this.access.db = this.db;
  }
  db = {
    auth: {
      getUser: async () => ({
        data: { user: this.verified ? this.user : null },
        error: this.verified ? null : { message: "invalid" },
      }),
      admin: {
        inviteUserByEmail: async () => {
          this.mailCalls++;
          if (this.mailThrows) throw Error("network ambiguity");
          return { data: { user: null }, error: this.mailError };
        },
      },
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      this.calls.push({ fn, args });
      if (fn === "sv_team_mail_claim") {
        const claimed = this.claim;
        this.claim = false;
        return { data: claimed, error: null };
      }
      if (fn === "sv_team_accept")
        return {
          data: company,
          error: this.acceptError ? { message: this.acceptError } : null,
        };
      return { data: { saved: true }, error: null };
    },
    from: (table: string) => new Query(this, table),
  };
  isolated = {
    auth: {
      setSession: async () => ({
        data: { user: this.pairUser, session: this.session },
        error: null,
      }),
      getUser: async () => ({ data: { user: this.pairUser }, error: null }),
      updateUser: async () => ({ data: { user: this.pairUser }, error: null }),
      signInWithOtp: async (value: unknown) => {
        this.otp.push(value);
        return { data: {}, error: null };
      },
    },
  };
  cookies = {
    auth: {
      setSession: async () => {
        this.cookieCalls++;
        return { error: null };
      },
    },
  };
}
class Query {
  value: unknown;
  singleRow = false;
  constructor(
    private h: Harness,
    private table: string,
  ) {}
  select() {
    return this;
  }
  eq() {
    return this;
  }
  order() {
    return this;
  }
  gt() {
    return this;
  }
  limit() {
    return this;
  }
  single() {
    this.singleRow = true;
    return this;
  }
  update(value: unknown) {
    this.value = value;
    return this;
  }
  then(resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) {
    if (this.value) this.h.updates.push(this.value);
    const row = this.table === "sv_companies" ? { seat_limit: 5 } : [];
    return Promise.resolve({ data: this.value ? null : row, error: null }).then(
      resolve,
      reject,
    );
  }
}
let api: typeof import("../src/lib/team/server"), h: Harness;
const host = globalThis as typeof globalThis & {
  __conveltaTeamHarness?: Harness;
};
const oldOrigin = process.env.SMARTVOLT_APP_URL,
  oldKey = process.env.SMARTVOLT_INVITATION_KEY,
  oldEnabled = process.env.SMARTVOLT_INVITATIONS_ENABLED;
before(async () => {
  const stubs: Record<string, string> = {
    "server-only": "export {};",
    "@/lib/saas/server":
      "export const requireCompany=async()=>globalThis.__conveltaTeamHarness.access;export const loadCompany=requireCompany;export const authClient=async()=>globalThis.__conveltaTeamHarness.cookies;",
    "@/lib/saas/mfa-server": `export const hasActiveAdminMembership=async()=>globalThis.__conveltaTeamHarness.privileged; export const enforceAdminMfa=async()=>{if(!globalThis.__conveltaTeamHarness.adminApproved)throw Error("MFA pending")};`,
    "@/lib/saas/database":
      "export const database=()=>globalThis.__conveltaTeamHarness.db;",
    "@/lib/saas/config":
      "export const saasConfig=()=>({url:'https://auth.example.invalid',key:'synthetic-public'});",
    "@supabase/supabase-js":
      "export const createClient=()=>globalThis.__conveltaTeamHarness.isolated;",
  };
  const output = await build({
    entryPoints: ["src/lib/team/server.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "isolated-service-boundaries",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            args.path in stubs
              ? { path: args.path, namespace: "test-boundary" }
              : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: "test-boundary" }, (args) => ({
            contents: stubs[args.path],
            loader: "js",
          }));
        },
      },
    ],
  });
  api = await import(
    "data:text/javascript;base64," +
      Buffer.from(output.outputFiles[0].text).toString("base64")
  );
  process.env.SMARTVOLT_APP_URL = "https://app.example.invalid";
  process.env.SMARTVOLT_INVITATIONS_ENABLED = "true";
  process.env.SMARTVOLT_INVITATION_KEY = Buffer.alloc(32, 7).toString("base64");
});
beforeEach(() => {
  h = new Harness();
  host.__conveltaTeamHarness = h;
});
after(() => {
  delete host.__conveltaTeamHarness;
  if (oldOrigin === undefined) delete process.env.SMARTVOLT_APP_URL;
  else process.env.SMARTVOLT_APP_URL = oldOrigin;
  if (oldKey === undefined) delete process.env.SMARTVOLT_INVITATION_KEY;
  else process.env.SMARTVOLT_INVITATION_KEY = oldKey;
  if (oldEnabled === undefined)
    delete process.env.SMARTVOLT_INVITATIONS_ENABLED;
  else process.env.SMARTVOLT_INVITATIONS_ENABLED = oldEnabled;
});
const acceptance = () => ({
  invitation: randomUUID(),
  token: "x".repeat(43),
  accessToken: h.session.access_token,
  refreshToken: h.session.refresh_token,
});
const invite = () => ({
  action: "invite",
  commandId: randomUUID(),
  name: "New member",
  email: "new@example.invalid",
  role: "agent",
  brandIds: ["main"],
  productIds: ["crm"],
});
test("acceptance uses the authenticated, confirmed mailbox, then persists the session after SQL admission", async () => {
  const input = acceptance();
  assert.deepEqual(await api.acceptTeam(input), { companyId: company });
  assert.equal(h.calls[0].fn, "sv_team_accept");
  assert.equal(h.calls[0].args.p_actor, member);
  assert.equal(h.calls[0].args.p_email, h.user.email);
  assert.equal(h.calls[0].args.p_hash, invitationHash(input.token));
  assert.equal(h.cookieCalls, 1);
});
test("anonymous, unconfirmed and unverifiable users never reach membership activation", async () => {
  for (const scenario of ["anonymous", "unconfirmed", "invalid"]) {
    h = new Harness();
    host.__conveltaTeamHarness = h;
    if (scenario === "anonymous") h.user.is_anonymous = true;
    if (scenario === "unconfirmed") h.user.email_confirmed_at = null;
    if (scenario === "invalid") h.verified = false;
    await assert.rejects(api.acceptTeam(acceptance()));
    assert.equal(h.calls.length, 0);
    assert.equal(h.cookieCalls, 0);
  }
});
test("mixing another account's refresh session cannot accept or install cookies", async () => {
  h.pairUser = { ...h.user, id: randomUUID() };
  await assert.rejects(api.acceptTeam(acceptance()), /登入憑證不一致/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.cookieCalls, 0);
});
test("revoked invitation authority blocks session installation and browser-supplied identity is rejected", async () => {
  h.acceptError = "invitation_context_changed";
  await assert.rejects(api.acceptTeam(acceptance()), /邀請已失效/);
  assert.equal(h.cookieCalls, 0);
  h.calls = [];
  await assert.rejects(
    api.acceptTeam({
      ...acceptance(),
      email: "forged@example.invalid",
      userId: owner,
    }),
  );
  assert.equal(h.calls.length, 0);
});
test("uncertain mail submission is never automatically replayed or labelled delivered", async () => {
  h.mailThrows = true;
  const input = invite();
  await api.actTeam(company, input);
  await api.actTeam(company, input);
  assert.equal(h.mailCalls, 1);
  assert.equal(h.updates.length, 0);
});
test("existing-account mail uses a no-create sign-in and keeps the invitation nonce scoped to the application", async () => {
  h.mailError = { code: "email_exists" };
  await api.actTeam(company, invite());
  assert.equal(h.mailCalls, 1);
  assert.equal(h.otp.length, 1);
  const payload = h.otp[0] as {
    options: { shouldCreateUser: boolean; emailRedirectTo: string };
  };
  assert.equal(payload.options.shouldCreateUser, false);
  const url = new URL(payload.options.emailRedirectTo);
  assert.equal(url.origin, "https://app.example.invalid");
  assert.equal(url.pathname, "/auth/invite");
  assert.equal(url.searchParams.get("token")!.length, 43);
  assert.deepEqual(h.updates, [{ mail_state: "submitted" }]);
});

test("an existing privileged invitee proves the trusted browser session before membership or password changes", async () => {
  h.privileged = true;
  await assert.rejects(
    api.acceptTeam({ ...acceptance(), password: "synthetic-test-password" }),
    /雙重驗證/,
  );
  assert.equal(h.calls.length, 0);
  assert.equal(h.cookieCalls, 0);
  h.adminApproved = true;
  assert.deepEqual(await api.acceptTeam(acceptance()), { companyId: company });
  assert.equal(h.cookieCalls, 0);
});
