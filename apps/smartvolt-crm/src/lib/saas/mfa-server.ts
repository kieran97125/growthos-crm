import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { z } from "zod";
import { authClient } from "./session";
import { database } from "./database";
import { AccessError } from "./identity";
import { saasConfig } from "./config";
import {
  mailboxIdentity,
  mailboxLifetime,
  openMailboxProof,
  sealMailboxProof,
  type MailboxProof,
} from "./mfa-proof";

const unavailable = () =>
  new AccessError("暫時未能核實雙重驗證，請稍後再試。", 503);
export async function verifiedSession(
  client: Awaited<ReturnType<typeof authClient>>,
  userId: string,
) {
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  if (
    error ||
    !claims ||
    claims.sub !== userId ||
    !z.uuid().safeParse(claims.session_id).success
  )
    throw new AccessError("請重新登入公司帳戶。", 401);
  return claims;
}
export async function trustedSession(user: string, session: string) {
  const { data, error } = await database().rpc("sv_trusted_mfa_session", {
    p_user: user,
    p_session: session,
  });
  if (error) throw unavailable();
  return data === true;
}
export const enforceAdminMfa = cache(async function enforceAdminMfa(
  user: string,
) {
  const client = await authClient();
  const claims = await verifiedSession(client, user);
  if (claims.aal !== "aal2" || !(await trustedSession(user, claims.session_id)))
    throw new AccessError("請先完成管理員雙重驗證。", 428);
});
/** Only an explicitly grandfathered owner can open the workspace before first enrolment. */
export const workspaceMfaPending = cache(async function workspaceMfaPending(
  user: string,
  owner: boolean,
) {
  try {
    await enforceAdminMfa(user);
    return false;
  } catch (error) {
    if (!owner || !(error instanceof AccessError) || error.status !== 428)
      throw error;
    const pending = await database().rpc("sv_mfa_enrollment_pending", {
      p_user: user,
    });
    if (pending.error) throw unavailable();
    if (pending.data !== true) throw error;
    return true;
  }
});
export const mailboxCookie =
  process.env.NODE_ENV === "production"
    ? "__Host-convelta-mfa-setup"
    : "convelta-mfa-setup";
export async function hasActiveAdminMembership(userId: string) {
  const membership = await database()
    .from("sv_memberships")
    .select("company_id,sv_companies!inner(status)")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("sv_companies.status", "active")
    .in("role", ["owner", "manager"])
    .limit(1);
  if (membership.error) throw unavailable();
  return Boolean(membership.data?.length);
}
export async function mfaContext() {
  const client = await authClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (
    error ||
    !user ||
    user.is_anonymous ||
    !user.email ||
    !user.email_confirmed_at
  )
    throw new AccessError("請以已確認電郵嘅公司帳戶登入。", 401);
  const claims = await verifiedSession(client, user.id);
  const db = database();
  if (!(await hasActiveAdminMembership(user.id)))
    throw new AccessError("此帳戶無管理員權限。", 403);
  const binding = await db
    .from("sv_trusted_mfa_factors")
    .select("factor_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (binding.error) throw unavailable();
  const key = saasConfig()!.secret;
  const identity = {
    user: user.id,
    session: claims.session_id,
    emailHash: mailboxIdentity(key, user.email),
  };
  const jar = await cookies();
  const proof = openMailboxProof(key, jar.get(mailboxCookie)?.value, identity);
  return {
    client,
    user,
    email: user.email,
    claims,
    db,
    factor: binding.data?.factor_id as string | undefined,
    identity,
    proof,
  };
}
export async function writeMailboxProof(value: MailboxProof) {
  (await cookies()).set(
    mailboxCookie,
    sealMailboxProof(saasConfig()!.secret, value),
    {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: Math.min(
        mailboxLifetime,
        Math.max(0, Math.ceil((value.expires - Date.now()) / 1000)),
      ),
    },
  );
}
export async function clearMailboxProof() {
  (await cookies()).delete(mailboxCookie);
}
export function authenticationMethods(
  amr: { method: string }[] | string[] | undefined,
) {
  return (amr ?? []).map((entry) =>
    typeof entry === "string" ? entry : entry.method,
  );
}
