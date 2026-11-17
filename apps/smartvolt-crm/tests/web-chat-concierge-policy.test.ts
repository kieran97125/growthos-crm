import { test } from "node:test";
import assert from "node:assert/strict";
import { assessChatTurn } from "../src/lib/web-chat/concierge-policy";
import { chatPalettes, chatTheme } from "../src/lib/web-chat/theme";
import { chatFrameHtml, chatEmbedScript } from "../src/lib/web-chat/embed";

test("explicit human-only persists as a preference; ordinary human requests keep C available", () => {
  for (const text of ["我想同真人傾", "Can I talk to a real person?"]) {
    const result = assessChatTurn(text);
    assert.equal(result.human, true);
    assert.equal(result.preference, null);
  }
  for (const text of [
    "淨係要真人客服",
    "唔好AI答",
    "human only please",
    "only a human please",
  ]) {
    assert.equal(assessChatTurn(text).preference, "human_only");
  }
  assert.equal(assessChatTurn("hello", "human_only").preference, "human_only");
  assert.equal(assessChatTurn("hello", "human").human, true);
});
test("declining a handoff never raises one, and visitors can ask C to resume", () => {
  for (const text of [
    "唔使真人，C先答",
    "唔好叫真人",
    "不要轉接真人",
    "I don't need a human agent",
  ]) {
    assert.equal(assessChatTurn(text).human, false, text);
  }
  for (const text of ["真人未覆，C幫我答", "C可以繼續答，真人請求請保留"]) {
    const result = assessChatTurn(text);
    assert.equal(result.human, false, text);
    assert.equal(result.preference, "cooperate", text);
  }
  assert.equal(assessChatTurn("hello", "resume_c").preference, "cooperate");
});
test("all brand palettes and bright custom colors have AA readable foregrounds and safe CSS", () => {
  for (const color of [
    ...chatPalettes.map((p) => p.color),
    "#FFFFFF",
    "#FFFF00",
    "#000000",
    "#808080",
  ]) {
    const theme = chatTheme(color);
    const c = [1, 3, 5]
      .map((i) => parseInt(theme.accent.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    const l = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    const ratio =
      theme.onAccent === "#FFFFFF" ? 1.05 / (l + 0.05) : (l + 0.05) / 0.05;
    assert.ok(ratio >= 4.5, color);
  }
  for (const color of [
    "red",
    "#fff",
    "#000000;display:none",
    "</style><script>alert(1)</script>",
    null,
  ]) {
    assert.equal(chatTheme(color).accent, "#2457E7");
  }
});
test("the same sanitized brand color reaches the launcher and iframe, without breaking merchant isolation", () => {
  assert.ok(
    chatEmbedScript("https://app.example.org", "#D97706").includes(
      "background:#D97706;color:#000000",
    ),
  );
  const html = chatFrameHtml(
    {
      id: "widget",
      name: "Merchant",
      greeting: "Hello",
      origin: "https://example.org",
      aiEnabled: true,
      accentColor: "#D97706",
    },
    "nonce",
  );
  assert.ok(html.includes("--accent:#D97706;--on-accent:#000000"));
  assert.ok(html.includes('id="waiting"'));
  assert.ok(html.includes('id="human-only"'));
  assert.ok(html.includes("e.origin !== config.origin"));
});
