import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Script } from "node:vm";
import {
  normalizeChatOrigin,
  chatSettingsAction,
  chatFramePolicy,
  publicChatAction,
} from "../src/lib/web-chat/model";
import { chatFrameHtml, chatEmbedScript } from "../src/lib/web-chat/embed";
test("website origins are exact HTTPS domains with no credentials, wildcard, port, path or localhost", () => {
  assert.equal(
    normalizeChatOrigin("https://EXAMPLE.org/"),
    "https://example.org",
  );
  for (const origin of [
    "http://example.org",
    "https://*.example.org",
    "https://user:pass@example.org",
    "https://example.org:8443",
    "https://example.org/path",
    "https://example.org/?q=1",
    "https://localhost",
    "https://127.0.0.1",
    "https://example.internal",
  ])
    assert.throws(() => normalizeChatOrigin(origin));
});
test("settings reject missing required data, unbounded sites and an automatic executable payload", () => {
  const base = {
    action: "save",
    commandId: randomUUID(),
    id: randomUUID(),
    revision: 0,
    brandId: "main",
    name: "Store",
    greeting: "Hello",
    origins: ["https://example.org"],
    enabled: false,
  };
  assert.equal(chatSettingsAction.safeParse(base).success, true);
  assert.equal(
    chatSettingsAction.safeParse({
      ...base,
      origins: ["https://*.example.org"],
    }).success,
    false,
  );
  assert.equal(
    chatSettingsAction.safeParse({
      ...base,
      origins: Array.from(
        { length: 11 },
        (_, i) => `https://site${i}.example.org`,
      ),
    }).success,
    false,
  );
  assert.equal(
    publicChatAction.safeParse({
      action: "send",
      threadId: randomUUID(),
      commandId: randomUUID(),
      origin: "https://example.org",
      body: "Hello",
      website: "spam",
    }).success,
    false,
  );
});
test("iframe content neutralizes merchant-supplied script closers and keeps bearer credentials off URL", () => {
  const html = chatFrameHtml(
    {
      id: randomUUID(),
      name: "</script><script>alert(1)</script>",
      greeting: "Safe",
      origin: "https://example.org",
    },
    "nonce",
  );
  assert.equal(html.includes("</script><script>alert(1)</script>"), false);
  const compact = html.replace(/\s+/g, "");
  assert.ok(compact.includes("Authorization:'Bearer'+session.token"));
  assert.ok(!html.includes("token:session.token"));
  assert.ok(compact.includes("credentials:'omit'"));
  assert.ok(compact.includes("text.textContent=message.body"));
});
test("per-widget frame CSP permits only verified exact ancestors and nonce scripts", () => {
  const policy = chatFramePolicy(["https://example.org"], "nonce");
  assert.ok(policy.includes("frame-ancestors https://example.org"));
  assert.ok(policy.includes("script-src 'nonce-nonce'"));
  assert.ok(!policy.includes("unsafe-inline"));
  assert.throws(() => chatFramePolicy(["https://*.example.org"], "nonce"));
  const script = chatEmbedScript("https://app.example.org");
  assert.ok(script.includes("e.origin!==base||e.source!==frame.contentWindow"));
  assert.ok(
    script.includes(
      "frame.sandbox='allow-scripts allow-same-origin allow-forms'",
    ),
  );
});

test("actual embed and nonce-frame programs parse as standalone browser scripts", () => {
  assert.doesNotThrow(
    () => new Script(chatEmbedScript("https://app.example.org")),
  );
  const html = chatFrameHtml(
    {
      id: randomUUID(),
      name: "Store",
      greeting: "Hello",
      origin: "https://example.org",
    },
    "nonce",
  );
  const code = html.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(code);
  assert.doesNotThrow(() => new Script(code));
});

test("visitor composer can submit inside the sandbox while native form navigation remains blocked", () => {
  const script = chatEmbedScript("https://app.example.org");
  const sandbox = script.match(/frame\.sandbox='([^']+)'/)?.[1].split(/\s+/);
  assert.ok(sandbox);
  assert.deepEqual(
    new Set(sandbox),
    new Set(["allow-scripts", "allow-same-origin", "allow-forms"]),
  );
  assert.ok(!sandbox.includes("allow-top-navigation"));
  assert.ok(!sandbox.includes("allow-popups"));
  const policy = chatFramePolicy(["https://example.org"], "nonce");
  assert.ok(policy.includes("form-action 'none'"));
  const html = chatFrameHtml(
    {
      id: randomUUID(),
      name: "Store",
      greeting: "Hello",
      origin: "https://example.org",
    },
    "nonce",
  );
  assert.match(
    html,
    /addEventListener\('submit',\s*e\s*=>\s*\{\s*e.preventDefault\(\);\s*send\(\)/,
  );
});
