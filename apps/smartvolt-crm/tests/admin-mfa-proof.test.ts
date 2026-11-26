import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mailboxIdentity,
  mailboxLifetime,
  openMailboxProof,
  sealMailboxProof,
} from "../src/lib/saas/mfa-proof";

const key = "synthetic-test-only-key",
  now = Date.now();
const identity = {
  user: randomUUID(),
  session: randomUUID(),
  emailHash: mailboxIdentity(key, "test@example.invalid"),
};
const expires = now + mailboxLifetime * 1000;
test("mailbox evidence binds password session, signed-in user, verified address and expiry", () => {
  const value = {
    ...identity,
    stage: "sent" as const,
    verifier: "synthetic-pkce-".repeat(4),
    expires,
  };
  const receipt = sealMailboxProof(key, value);
  assert.deepEqual(openMailboxProof(key, receipt, identity, now), value);
  for (const replacement of [
    { user: randomUUID() },
    { session: randomUUID() },
    { emailHash: mailboxIdentity(key, "changed@example.invalid") },
  ])
    assert.equal(
      openMailboxProof(key, receipt, { ...identity, ...replacement }, now),
      null,
    );
  assert.equal(openMailboxProof(key, receipt, identity, expires), null);
  assert.equal(
    openMailboxProof("rotated-test-key", receipt, identity, now),
    null,
  );
  assert.equal(
    openMailboxProof(
      key,
      sealMailboxProof(key, { ...value, expires: expires + 1 }),
      identity,
      now,
    ),
    null,
  );
});
test("an incomplete email cannot be relabelled as confirmed or supply a chosen factor", () => {
  const value = {
    ...identity,
    stage: "sent" as const,
    verifier: "synthetic-pkce-".repeat(4),
    expires,
  };
  const signed = sealMailboxProof(key, value);
  const signature = signed.split(".")[1];
  const injected = Buffer.from(
    JSON.stringify({
      ...identity,
      stage: "enrolling",
      factor: randomUUID(),
      expires,
    }),
  ).toString("base64url");
  assert.equal(
    openMailboxProof(key, `${injected}.${signature}`, identity, now),
    null,
  );
  for (const malformed of [
    undefined,
    "",
    ".",
    "x.y",
    signed + ".extra",
    "f".repeat(2400),
  ])
    assert.equal(openMailboxProof(key, malformed, identity, now), null);
  assert.equal(
    mailboxIdentity(key, "TEST@EXAMPLE.INVALID"),
    identity.emailHash,
  );
});
