import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalAppOrigin,
  confirmationSchema,
  newPasswordSchema,
} from "../src/lib/saas/auth-contract";
test("auth links require a canonical origin without credentials or external paths", () => {
  assert.equal(
    canonicalAppOrigin("https://smartvolt-crm.vercel.app"),
    "https://smartvolt-crm.vercel.app",
  );
  for (const url of [
    "https://user:secret@example.com",
    "https://example.com/evil",
    "https://example.com/?next=evil",
    "http://example.com",
    "javascript:alert(1)",
  ])
    assert.throws(() => canonicalAppOrigin(url));
});
test("confirmation accepts only explicit invitation/recovery tokens and matching strong passwords", () => {
  assert.ok(
    confirmationSchema.safeParse({
      token_hash: "a".repeat(64),
      type: "recovery",
    }).success,
  );
  for (const type of ["email", "signup", "sms", "magiclink"])
    assert.ok(
      !confirmationSchema.safeParse({ token_hash: "a".repeat(64), type })
        .success,
    );
  assert.ok(
    !confirmationSchema.safeParse({ token_hash: "../evil", type: "recovery" })
      .success,
  );
  assert.ok(
    !newPasswordSchema.safeParse({ password: "short", confirmation: "short" })
      .success,
  );
  assert.ok(
    !newPasswordSchema.safeParse({
      password: "long-enough-password",
      confirmation: "different",
    }).success,
  );
  assert.ok(
    newPasswordSchema.safeParse({
      password: "long-enough-password",
      confirmation: "long-enough-password",
    }).success,
  );
});
