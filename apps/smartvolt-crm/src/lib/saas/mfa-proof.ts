import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const identity = z.object({
  user: z.uuid(),
  session: z.uuid(),
  emailHash: z.string().regex(/^[0-9a-f]{64}$/),
  expires: z.number().int().positive(),
});
const proof = z.discriminatedUnion("stage", [
  identity.extend({
    stage: z.literal("sent"),
    verifier: z.string().min(32).max(512),
  }),
  identity.extend({ stage: z.literal("confirmed") }),
  identity.extend({ stage: z.literal("enrolling"), factor: z.uuid() }),
]);
export type MailboxProof = z.infer<typeof proof>;
export const mailboxLifetime = 10 * 60;
function mac(key: string, data: string) {
  return createHmac("sha256", key)
    .update("convelta:privileged-enrolment:v1\0")
    .update(data)
    .digest();
}
export function mailboxIdentity(key: string, email: string) {
  return mac(key, "email:" + email.toLowerCase()).toString("hex");
}
export function sealMailboxProof(key: string, value: MailboxProof) {
  const body = Buffer.from(JSON.stringify(proof.parse(value))).toString(
    "base64url",
  );
  return `${body}.${mac(key, body).toString("base64url")}`;
}
export function openMailboxProof(
  key: string,
  value: string | undefined,
  current: { user: string; session: string; emailHash: string },
  now = Date.now(),
): MailboxProof | null {
  if (!value || value.length > 2000 || !/^[\w-]+\.[\w-]+$/.test(value))
    return null;
  const [body, sig] = value.split(".");
  const supplied = Buffer.from(sig, "base64url"),
    expected = mac(key, body);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return null;
  try {
    const decoded = proof.parse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    );
    if (
      decoded.user !== current.user ||
      decoded.session !== current.session ||
      decoded.emailHash !== current.emailHash ||
      decoded.expires <= now ||
      decoded.expires > now + mailboxLifetime * 1000
    )
      return null;
    return decoded;
  } catch {
    return null;
  }
}
