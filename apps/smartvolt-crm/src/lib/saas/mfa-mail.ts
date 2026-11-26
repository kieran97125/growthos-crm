import "server-only";
import { createClient } from "@supabase/supabase-js";
import { saasConfig } from "./config";
import { AccessError } from "./identity";
import {
  authenticationMethods,
  mfaContext,
  writeMailboxProof,
} from "./mfa-server";

// Keep the mailbox session separate from the password session, and persist only the PKCE verifier.
export function mailboxClient(verifier?: string) {
  const config = saasConfig()!;
  const key = "convelta-mail-proof";
  const verifierKey = `${key}-code-verifier`;
  const values = new Map<string, string>();
  if (verifier) values.set(verifierKey, verifier);
  const client = createClient(config.url, config.key, {
    auth: {
      storageKey: key,
      flowType: "pkce",
      persistSession: true,
      detectSessionInUrl: false,
      autoRefreshToken: false,
      storage: {
        getItem: (k: string) => values.get(k) ?? null,
        setItem: (k: string, v: string) => {
          values.set(k, v);
        },
        removeItem: (k: string) => {
          values.delete(k);
        },
      },
    },
  });
  return { client, verifier: () => values.get(verifierKey) };
}
export async function confirmMailbox(
  input: { pkce: string } | { otp: string },
) {
  const c = await mfaContext();
  if (c.factor || c.proof?.stage !== "sent")
    throw new AccessError("請喺原本登入嘅瀏覽器重新要求驗證電郵。", 403);
  const { client } = mailboxClient(c.proof.verifier);
  const response =
    "pkce" in input
      ? await client.auth.exchangeCodeForSession(input.pkce)
      : await client.auth.verifyOtp({
          email: c.email,
          token: input.otp,
          type: "email",
        });
  const session = response.data.session;
  if (
    response.error ||
    !session ||
    session.user.id !== c.user.id ||
    session.user.email?.toLowerCase() !== c.email.toLowerCase()
  )
    throw new AccessError("電郵驗證已失效，請重新要求。", 403);
  const verified = await client.auth.getClaims(session.access_token);
  const claims = verified.data?.claims;
  if (
    verified.error ||
    !claims ||
    claims.sub !== c.user.id ||
    claims.session_id === c.claims.session_id ||
    !authenticationMethods(claims.amr).some(
      (m) => m === "otp" || m === "magiclink",
    )
  )
    throw new AccessError("未能確認電郵擁有權。", 403);
  // Revoke only this temporary OTP login, leaving the original password session intact.
  const closed = await client.auth.signOut({ scope: "local" });
  if (closed.error)
    throw new AccessError("電郵驗證暫時未能完成，請重新要求。", 503);
  await writeMailboxProof({
    ...c.identity,
    stage: "confirmed",
    expires: c.proof.expires,
  });
}
