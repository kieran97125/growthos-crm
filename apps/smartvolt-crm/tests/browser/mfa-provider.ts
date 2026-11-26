// Loopback-only substitute for Supabase Auth and PostgREST. All factors, signed
// sessions and users belong to this test run; the application uses its real SDK.
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
} from "node:crypto";
import { createServer } from "node:http";
import { createCompanyState } from "../../src/lib/saas/workspace";

export function mfaProvider() {
  const owner = randomUUID(),
    company = randomUUID(),
    second = randomUUID();
  const email = "owner@example.invalid",
    password = randomUUID();
  const key = randomBytes(32),
    factorId = randomUUID();
  const tokens = new Map<string, { session: string; method: string }>();
  const verifiedSessions = new Set<string>();
  const challenges = new Map<string, string>();
  const enrolledAt = new Date().toISOString();
  let enrolled = false,
    verified = false,
    bound = false,
    enrollmentPending = false,
    mailCode = "",
    mailLinkCode = "",
    mailChallenge = "",
    mailRevoked = 0,
    workspaceReads = 0;
  const authenticatorCode = String(randomInt(100000, 1000000));
  const user = () => ({
    id: owner,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: enrolledAt,
    app_metadata: {},
    user_metadata: {},
    created_at: enrolledAt,
    factors: enrolled
      ? [
          {
            id: factorId,
            factor_type: "totp",
            status: verified ? "verified" : "unverified",
            friendly_name: "Local test phone",
            created_at: enrolledAt,
            updated_at: enrolledAt,
          },
        ]
      : [],
  });
  function session(method: string, sessionId: string = randomUUID()) {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const encode = (data: unknown) =>
      Buffer.from(JSON.stringify(data)).toString("base64url");
    const claims = {
      aud: "authenticated",
      sub: owner,
      role: "authenticated",
      email,
      iat: exp - 3600,
      exp,
      session_id: sessionId,
      aal: method === "totp" ? "aal2" : "aal1",
      amr: [{ method, timestamp: exp - 3600 }],
    };
    const unsigned =
      encode({ alg: "HS256", typ: "JWT" }) + "." + encode(claims);
    const token =
      unsigned +
      "." +
      createHmac("sha256", key).update(unsigned).digest("base64url");
    tokens.set(token, { method, session: sessionId });
    return {
      access_token: token,
      refresh_token: randomUUID(),
      token_type: "bearer",
      expires_in: 3600,
      expires_at: exp,
      user: user(),
    };
  }
  const fixture = createCompanyState({
    companyId: company,
    companyName: "Fixture Clinic",
    brands: [{ id: "main", name: "Synthetic", short: "S" }],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://127.0.0.1"),
      path = url.pathname;
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : {};
    const bearer = req.headers.authorization?.slice(7) ?? "";
    const caller = tokens.get(bearer);
    const json = (data: unknown, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    const denied = () => json({ error: "fixture_request_denied" }, 403);
    if (
      path === "/auth/v1/token" &&
      url.searchParams.get("grant_type") === "password"
    )
      return body.email === email && body.password === password
        ? json(session("password"))
        : denied();
    if (path === "/auth/v1/user") return caller ? json(user()) : denied();
    if (
      path === "/auth/v1/otp" &&
      body.email === email &&
      body.create_user === false &&
      body.code_challenge_method === "s256" &&
      url.searchParams.get("redirect_to") ===
        "https://convelta.example.invalid/auth/mfa/confirm" &&
      body.code_challenge
    ) {
      mailCode = String(randomInt(100000, 1000000));
      mailLinkCode = randomUUID();
      mailChallenge = body.code_challenge;
      return json({});
    }
    if (
      path === "/auth/v1/token" &&
      url.searchParams.get("grant_type") === "pkce" &&
      mailLinkCode &&
      body.auth_code === mailLinkCode &&
      typeof body.code_verifier === "string" &&
      createHash("sha256").update(body.code_verifier).digest("base64url") ===
        mailChallenge
    ) {
      mailCode = "";
      mailLinkCode = "";
      return json(session("magiclink"));
    }
    if (
      path === "/auth/v1/verify" &&
      body.email === email &&
      mailCode &&
      body.token === mailCode &&
      body.type === "email"
    ) {
      mailCode = "";
      mailLinkCode = "";
      return json(session("otp"));
    }
    if (
      path === "/auth/v1/logout" &&
      caller &&
      ["otp", "magiclink"].includes(caller.method) &&
      url.searchParams.get("scope") === "local"
    ) {
      tokens.delete(bearer);
      mailRevoked++;
      return json({});
    }
    if (
      path === "/auth/v1/factors" &&
      body.factor_type === "totp" &&
      caller?.method === "password"
    ) {
      enrolled = true;
      return json({
        id: factorId,
        type: "totp",
        totp: {
          secret: "JBSWY3DPEHPK3PXP",
          qr_code: '<svg xmlns="http://www.w3.org/2000/svg"/>',
        },
      });
    }
    if (
      path === `/auth/v1/factors/${factorId}/challenge` &&
      caller &&
      enrolled
    ) {
      const id = randomUUID();
      challenges.set(id, caller.session);
      return json({
        id,
        type: "totp",
        expires_at: Math.floor(Date.now() / 1000) + 300,
      });
    }
    if (
      path === `/auth/v1/factors/${factorId}/verify` &&
      caller &&
      body.code === authenticatorCode &&
      challenges.get(body.challenge_id) === caller.session
    ) {
      challenges.delete(body.challenge_id);
      verified = true;
      verifiedSessions.add(caller.session);
      return json(session("totp", caller.session));
    }
    if (bearer !== "synthetic-local-service-role-key") return denied();
    if (path === "/rest/v1/sv_memberships") {
      const ids = url.searchParams.has("company_id")
        ? [company]
        : [company, second];
      return json(
        ids.map((id) => ({
          company_id: id,
          role: "owner",
          display_name: "Owner",
          brand_ids: null,
          product_ids: null,
          sv_companies: {
            id,
            name: id === company ? "Fixture Clinic" : "Second Clinic",
            status: "active",
          },
        })),
      );
    }
    if (path === "/rest/v1/sv_trusted_mfa_factors") {
      if (req.method === "POST") {
        if (!verified || body.user_id !== owner || body.factor_id !== factorId)
          return denied();
        bound = true;
        enrollmentPending = false;
        return json({}, 201);
      }
      return json(bound ? [{ factor_id: factorId }] : []);
    }
    if (path === "/rest/v1/rpc/sv_mfa_enrollment_pending")
      return json(body.p_user === owner && enrollmentPending && !bound);
    if (path === "/rest/v1/rpc/sv_trusted_mfa_session")
      return json(
        bound && body.p_user === owner && verifiedSessions.has(body.p_session),
      );
    if (path === "/rest/v1/sv_company_products")
      return json([
        {
          product: "crm",
          status: "active",
          starts_at: enrolledAt,
          ends_at: null,
        },
      ]);
    if (path === "/rest/v1/sv_workspaces") {
      workspaceReads++;
      return json({ revision: 1, payload: fixture });
    }
    if (path === "/rest/v1/sv_customers") return json([]);
    return json({ error: "unexpected fixture endpoint" }, 404);
  });
  return {
    owner,
    company,
    email,
    password,
    authenticatorCode,
    designatePendingOwner: () => {
      enrollmentPending = true;
    },
    server,
    status: () => ({
      mailCode,
      mailLinkCode,
      mailRevoked,
      workspaceReads,
      bound,
    }),
  };
}
