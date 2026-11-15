import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { VoiceItem, VoicePage } from "../src/lib/voice/model";
import {
  fixtureBundle,
  mountFixture,
  syntheticCompany as companyId,
  syntheticSource as sourceId,
  syntheticOtherSource as otherSourceId,
  syntheticId as itemId,
} from "./phase456-fixture";

const messageId = "99999999-9999-4999-8999-999999999999";
const otherMessageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const original = "想星期六下午試堂，please call me later。";
const corrected = "想星期日下午試堂，please call me later。";
function item(text = original, revision = 0): VoiceItem {
  const date = text.includes("星期日") ? "星期日下午" : "星期六下午";
  return {
    id: itemId,
    messageId,
    available: true,
    status: "completed",
    audioUrl: `/api/companies/${companyId}/voice/audio?brandId=main&source=whatsapp&sourceId=${sourceId}&messageId=${messageId}`,
    origin: "provider",
    transcript: {
      id: "77777777-7777-4777-8777-777777777777",
      originalText: original,
      text,
      language: "mixed",
      revision,
      extractions: [
        { kind: "need", text: "試堂", quote: "試堂" },
        { kind: "date", text: date, quote: date },
      ],
      corrected: revision > 0,
      createdAt: "2026-11-15T10:00:00Z",
      history:
        revision > 0
          ? [
              {
                revision,
                text,
                reason: "已對照原音核實星期日",
                createdAt: "2026-11-15T10:00:00Z",
              },
            ]
          : [],
    },
  };
}
function available(): VoiceItem {
  return { ...item(), status: "available", transcript: null };
}
function voicePage(items: VoiceItem[], permissions = true): VoicePage {
  return {
    items,
    canTranscribe: permissions,
    canCorrect: permissions,
    readiness: "configured",
    blocker: null,
  };
}
let bundle = "";
test.beforeAll(async () => {
  bundle = await fixtureBundle(
    `import React,{useState}from'react';import{createRoot}from'react-dom/client';import VoiceMessage from './src/components/voice/VoiceMessage';function Fixture(){const[source,setSource]=useState('${sourceId}');return <main><h1>語音轉錄驗收</h1><nav className="fixture-nav" aria-label="合成對話切換"><button onClick={()=>setSource('${sourceId}')}>第一段語音對話</button><button onClick={()=>setSource('${otherSourceId}')}>第二段語音對話</button></nav><VoiceMessage companyId='${companyId}' brandId='main' source='whatsapp' sourceId={source} messageId={source==='${sourceId}'?'${messageId}':'${otherMessageId}'}/></main>}createRoot(document.getElementById('fixture')).render(<Fixture/>);`,
  );
});
async function mount(
  page: Page,
  options: {
    initial?: VoiceItem[];
    permissions?: boolean;
    get?: (source: string | null) => VoicePage;
    post?: (route: Route, body: Record<string, unknown>) => Promise<void>;
  } = {},
) {
  let current = options.initial ?? [available()];
  return mountFixture(page, {
    name: "voice",
    bundle,
    styles: ["src/components/voice/voice.css"],
    handle: async (route, url, body) => {
      if (url.pathname.endsWith("/voice/audio")) {
        await route.fulfill({
          contentType: "audio/wav",
          body: Buffer.from(
            "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
            "base64",
          ),
        });
        return;
      }
      if (!url.pathname.endsWith("/voice")) {
        await route.fulfill({
          status: 404,
          json: { error: "Unexpected fixture endpoint" },
        });
        return;
      }
      if (!body) {
        await route.fulfill({
          json: options.get
            ? options.get(url.searchParams.get("sourceId"))
            : voicePage(current, options.permissions),
        });
        return;
      }
      if (options.post) {
        await options.post(route, body);
        return;
      }
      if (body.type === "transcribe") current = [item()];
      else if (body.type === "correct") current = [item(String(body.text), 1)];
      await route.fulfill({
        json:
          body.type === "correct"
            ? { saved: true, item: current[0] }
            : { item: current[0] },
      });
    },
  });
}

test("an original audio read never transcribes until the teammate explicitly asks", async ({
  page,
}) => {
  const commands = await mount(page);
  await expect(
    page.getByRole("button", { name: "轉成文字", exact: true }),
  ).toBeEnabled();
  expect(commands).toEqual([]);
  await page.getByRole("button", { name: "轉成文字", exact: true }).click();
  await expect(page.getByText(original, { exact: true }).first()).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(commands[0].body).toMatchObject({
    type: "transcribe",
    brandId: "main",
    source: "whatsapp",
    sourceId,
    messageId,
  });
  expect(commands[0].body.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(commands[0].body).not.toHaveProperty("url");
  expect(commands[0].body).not.toHaveProperty("transcript");
});

test("an uncertain transcription rechecks the same request rather than reserving another model call", async ({
  page,
}) => {
  let current: VoiceItem[] = [available()];
  let attempts = 0;
  const commands = await mount(page, {
    get: () => voicePage(current),
    post: async (route) => {
      if (++attempts === 1) {
        await route.abort("failed");
        return;
      }
      current = [item()];
      await route.fulfill({ json: { item: current[0] } });
    },
  });
  await page.getByRole("button", { name: "轉成文字", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對同一轉錄", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "核對同一轉錄", exact: true }).click();
  await expect(page.getByText(original, { exact: true }).first()).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[1].body).toEqual(commands[0].body);
});

test("a confirmed failed receipt allows a new explicit transcription request", async ({
  page,
}) => {
  let current: VoiceItem[] = [available()];
  let attempts = 0;
  const commands = await mount(page, {
    get: () => voicePage(current),
    post: async (route) => {
      if (++attempts === 1) {
        await route.fulfill({
          status: 503,
          json: {
            error: "轉錄已確認失敗，請重新轉錄。",
            terminalFailure: true,
          },
        });
        return;
      }
      current = [item()];
      await route.fulfill({ json: { item: current[0] } });
    },
  });
  await page.getByRole("button", { name: "轉成文字", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("轉錄已確認失敗");
  await page.getByRole("button", { name: "轉成文字", exact: true }).click();
  await expect(page.getByText(original, { exact: true }).first()).toBeVisible();
  expect(commands[1].body.requestId).not.toBe(commands[0].body.requestId);
});

test("missing original audio is shown honestly and cannot trigger a model request", async ({
  page,
}) => {
  const commands = await mount(page, {
    initial: [
      {
        ...available(),
        available: false,
        status: "missing_audio",
        audioUrl: null,
      },
    ],
  });
  await expect(
    page.getByText(/未能取得原音|未有可用原音|原音未能取得/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "轉成文字", exact: true }),
  ).toBeDisabled();
  expect(commands).toEqual([]);
});

test("a viewer can inspect a transcript without receiving generation or correction actions", async ({
  page,
}) => {
  const commands = await mount(page, { initial: [item()], permissions: false });
  await expect(page.getByText(original, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "轉成文字", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "修正逐字稿", exact: true }),
  ).toHaveCount(0);
  expect(commands).toEqual([]);
});

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`voice ${name} keeps transcript, original audio and grounded needs readable and accessible`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const commands = await mount(page, { initial: [item()] });
    await expect(
      page.getByText(original, { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("試堂", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByText("星期六下午", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    expect(await page.locator("audio").count()).toBe(1);
    const violations = (
      await new AxeBuilder({ page }).analyze()
    ).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`voice-${name}.png`),
      fullPage: true,
    });
    expect(commands).toEqual([]);
  });
}

test("a corrected transcript retains the exact original and auditable reason", async ({
  page,
}) => {
  const commands = await mount(page, { initial: [item()] });
  await page.getByRole("button", { name: "修正逐字稿", exact: true }).click();
  await page.getByLabel("逐字稿內容", { exact: true }).fill(corrected);
  await page
    .getByLabel("修正原因", { exact: true })
    .fill("已對照原音核實星期日");
  await page.getByRole("button", { name: "儲存修正", exact: true }).click();
  await expect(
    page.getByText(corrected, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(commands[0].body).toMatchObject({
    type: "correct",
    expectedRevision: 0,
    text: corrected,
    reason: "已對照原音核實星期日",
  });
  expect(commands[0].body).not.toHaveProperty("originalText");
  await page.getByText("原文與修正記錄", { exact: true }).click();
  await expect(
    page.getByText(original, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
});

test("a delayed transcription cannot fill another conversation's voice panel", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  let first: VoiceItem[] = [available()];
  const secondText = "I would like to ask about memberships.";
  const second: VoiceItem = {
    ...item(),
    id: otherSourceId,
    messageId: otherMessageId,
    audioUrl: `/api/companies/${companyId}/voice/audio?brandId=main&source=whatsapp&sourceId=${otherSourceId}&messageId=${otherMessageId}`,
    transcript: {
      ...item().transcript!,
      originalText: secondText,
      text: secondText,
      language: "english",
      extractions: [],
    },
  };
  const commands = await mount(page, {
    get: (source) => voicePage(source === sourceId ? first : [second]),
    post: async (route) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      first = [item()];
      await route.fulfill({ json: { item: first[0] } });
    },
  });
  const completed = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/voice"),
  );
  await page.getByRole("button", { name: "轉成文字", exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await page
    .getByRole("button", { name: "第二段語音對話", exact: true })
    .click();
  await expect(
    page.getByText(secondText, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  release!();
  await completed;
  await expect(
    page.getByText(secondText, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText(original, { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  expect(commands).toHaveLength(1);
  expect(commands[0].body.sourceId).toBe(sourceId);
});

test("a reloaded running transcript reconciles its saved actor-owned request ID", async ({
  page,
}) => {
  const requestId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const commands = await mount(page, {
    initial: [{ ...available(), status: "running", requestId }],
  });
  await expect(
    page.getByRole("button", { name: "核對轉錄", exact: true }),
  ).toBeEnabled();
  expect(commands).toEqual([]);
  await page.getByRole("button", { name: "核對轉錄", exact: true }).click();
  await expect(
    page.getByText(original, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(commands[0].body.requestId).toBe(requestId);
});

test("transcript edits are retained per conversation without altering another source", async ({
  page,
}) => {
  const secondText = "I would like to ask about memberships.";
  const second: VoiceItem = {
    ...item(),
    id: otherSourceId,
    messageId: otherMessageId,
    audioUrl: `/api/companies/${companyId}/voice/audio?brandId=main&source=whatsapp&sourceId=${otherSourceId}&messageId=${otherMessageId}`,
    transcript: {
      ...item().transcript!,
      originalText: secondText,
      text: secondText,
      language: "english",
      extractions: [],
    },
  };
  const commands = await mount(page, {
    get: (source) => voicePage(source === sourceId ? [item()] : [second]),
  });
  await page.getByRole("button", { name: "修正逐字稿", exact: true }).click();
  await page.getByLabel("逐字稿內容", { exact: true }).fill(corrected);
  await page.getByLabel("修正原因", { exact: true }).fill("正在對照原音核對");
  await page
    .getByRole("button", { name: "第二段語音對話", exact: true })
    .click();
  await expect(
    page.getByText(secondText, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByLabel("逐字稿內容", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "第一段語音對話", exact: true })
    .click();
  await expect(page.getByLabel("逐字稿內容", { exact: true })).toHaveValue(
    corrected,
  );
  await expect(page.getByLabel("修正原因", { exact: true })).toHaveValue(
    "正在對照原音核對",
  );
  expect(commands).toEqual([]);
});
