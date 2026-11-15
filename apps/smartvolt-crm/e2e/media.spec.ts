import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  fixtureBundle,
  mountFixture,
  syntheticCompany as companyId,
  syntheticSource as sourceId,
  syntheticId as assetId,
} from "./phase456-fixture";
import { inspectMedia } from "../src/lib/media/bytes";
const actorId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  otherActorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  messageId = "99999999-9999-4999-8999-999999999999",
  editorToken = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6hcAAAAASUVORK5CYII=",
  "base64",
);
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
let bundle = "";
test.beforeAll(async () => {
  bundle = await fixtureBundle(
    `import React,{useState}from'react';import{createRoot}from'react-dom/client';import MediaComposer from'./src/components/media/MediaComposer';import MediaMessage from'./src/components/media/MediaMessage';function Fixture(){const[allowed,setAllowed]=useState(true);const[actor,setActor]=useState('${actorId}');return <main><h1>私人附件驗收</h1><button onClick={()=>setActor(actor==='${actorId}'?'${otherActorId}':'${actorId}')}>切換測試用戶</button><button onClick={()=>setAllowed(false)}>暫停新發送</button><MediaMessage companyId='${companyId}' brandId='main' source='whatsapp' sourceId='${sourceId}' messageId='${messageId}'/><MediaComposer actorId={actor} companyId='${companyId}' brandId='main' source='whatsapp' sourceId='${sourceId}' revision={7} canSend={allowed} acquireEditor={async()=>'${editorToken}'} onSent={()=>{}}/></main>}createRoot(document.getElementById('fixture')).render(<Fixture/>);`,
  );
});
type Options = {
  sendUnknown?: boolean;
  blockComplete?: boolean;
};
async function mount(page: Page, options: Options = {}) {
  let uploaded: Uint8Array | null = null,
    lastClient: string | null = null,
    release: () => void = () => {},
    uploadedId = assetId;
  const puts: string[] = [];
  await page.route(
    "https://synthetic.supabase.co/storage/**",
    async (route) => {
      const request = route.request(),
        headers = {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "PUT, OPTIONS",
          "access-control-allow-headers": "x-upsert,content-type",
        };
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers });
        return;
      }
      puts.push(request.method());
      const form = await new Response(
        new Uint8Array(request.postDataBuffer()!),
        { headers: { "Content-Type": request.headers()["content-type"] } },
      ).formData();
      const file = form.get("") as File;
      uploaded = new Uint8Array(await file.arrayBuffer());
      await route.fulfill({ json: { Key: "synthetic" }, headers });
    },
  );
  await page.route("**/__media_image__", (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
  const commands = await mountFixture(page, {
    name: "media",
    bundle,
    styles: ["src/components/ui/dialog.css", "src/components/media/media.css"],
    handle: async (
      route: Route,
      url: URL,
      body: Record<string, unknown> | null,
    ) => {
      if (!url.pathname.endsWith("/media")) {
        await route.fulfill({
          status: 404,
          json: { error: "Unexpected fixture endpoint" },
        });
        return;
      }
      if (!body) {
        await route.fulfill({
          json: {
            items: [
              {
                id: messageId + ":0",
                assetId: null,
                messageId,
                index: 0,
                kind: "image",
                filename: "客人相片.png",
                mimeType: null,
                bytes: null,
                available: true,
              },
            ],
          },
        });
        return;
      }
      if (body.action === "prepare" || body.action === "open") {
        await route.fulfill({
          json: {
            asset: {
              id: assetId,
              kind: "image",
              filename: "客人相片.png",
              mimeType: "image/png",
              bytes: png.length,
              state: "ready",
            },
            url: "/__media_image__",
            downloadUrl: "/__media_image__?download=1",
            expiresAt: "2099-01-01T00:00:00Z",
          },
        });
        return;
      }
      if (body.action === "reserve") {
        uploadedId = String(body.requestId);
        await route.fulfill({
          json: {
            assetId: uploadedId,
            uploadUrl: `https://synthetic.supabase.co/storage/v1/object/upload/sign/convelta-attachments/${companyId}/${uploadedId}?token=synthetic`,
            expiresAt: "2099-01-01T00:00:00Z",
          },
        });
        return;
      }
      if (body.action === "cancel") {
        await route.fulfill({ json: { cancelled: true } });
        return;
      }
      if (body.action === "complete") {
        if (options.blockComplete)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        try {
          const meta = await inspectMedia(uploaded ?? pdf);
          await route.fulfill({
            json: {
              asset: {
                id: uploadedId,
                kind: meta.kind,
                filename: "資料.pdf",
                mimeType: meta.mimeType,
                bytes: meta.bytes,
                state: "ready",
              },
            },
          });
        } catch {
          await route.fulfill({
            status: 422,
            json: { error: "檔案內容未能辨識，或不支援此格式。" },
          });
        }
        return;
      }
      if (body.action === "send") {
        lastClient = String(body.clientId);
        if (options.sendUnknown) {
          await route.abort("failed");
          return;
        }
        await route.fulfill({
          json: {
            receipt: {
              clientId: lastClient,
              messageId,
              state: "accepted",
              errorCode: null,
              replayed: false,
            },
          },
        });
        return;
      }
      if (body.action === "receipt") {
        await route.fulfill({
          json: {
            receipt: {
              clientId: body.clientId,
              messageId,
              state: "accepted",
              errorCode: null,
              replayed: true,
            },
          },
        });
        return;
      }
      await route.fulfill({
        status: 400,
        json: { error: "Unexpected fixture command" },
      });
    },
  });
  return {
    commands,
    puts,
    lastClient: () => lastClient,
    release: () => release(),
  };
}
async function choose(page: Page, bytes = pdf) {
  await page.getByRole("button", { name: "加入附件", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "資料.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
}

test("private incoming preview is explicit, scoped, and never calls a speech model", async ({
  page,
}) => {
  const { commands } = await mount(page);
  await expect(
    page.getByRole("button", { name: "開啟附件", exact: true }),
  ).toBeEnabled();
  expect(commands).toEqual([]);
  await page.getByRole("button", { name: "開啟附件", exact: true }).click();
  await expect(page.getByRole("img", { name: "客人相片.png" })).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(commands[0].body).toEqual({
    brandId: "main",
    source: "whatsapp",
    sourceId,
    action: "prepare",
    messageId,
    index: 0,
  });
  await expect(page.getByRole("link", { name: "下載原檔" })).toHaveAttribute(
    "href",
    "/__media_image__?download=1",
  );
});
test("private upload validates actual bytes before explicit leased attachment send", async ({
  page,
}) => {
  const f = await mount(page);
  await choose(page);
  expect(f.commands).toEqual([]);
  await page.getByRole("button", { name: "上載並核對", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "傳送附件", exact: true }),
  ).toBeEnabled();
  expect(f.puts).toEqual(["PUT"]);
  expect(f.commands.map((c) => c.body.action)).toEqual(["reserve", "complete"]);
  await page.getByRole("button", { name: "傳送附件", exact: true }).click();
  await expect(
    page.getByText("平台已接收；送達狀態會繼續更新。", { exact: true }),
  ).toBeVisible();
  expect(f.commands[2].body).toMatchObject({
    action: "send",
    editorToken,
    revision: 7,
    caption: "",
  });
  expect(f.commands[2].body).not.toHaveProperty("to");
  expect(f.commands[2].body).not.toHaveProperty("url");
});
test("a forged PDF is rejected by the real byte inspector and never exposes a send button", async ({
  page,
}) => {
  const f = await mount(page);
  await choose(page, Buffer.from("<html>forged PDF</html>"));
  await page.getByRole("button", { name: "上載並核對", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("檔案內容未能辨識");
  await expect(
    page.getByRole("button", { name: "傳送附件", exact: true }),
  ).toHaveCount(0);
  expect(f.commands.some((c) => c.body.action === "send")).toBe(false);
});
test("cancelling a verified staged upload sends no customer message", async ({
  page,
}) => {
  const f = await mount(page);
  await choose(page);
  await page.getByRole("button", { name: "上載並核對", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "傳送附件", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(f.commands.map((c) => c.body.action)).toEqual([
    "reserve",
    "complete",
    "cancel",
  ]);
  await page.getByRole("button", { name: "加入附件", exact: true }).click();
  await expect(
    page.getByText("選擇圖片、影片或文件", { exact: true }),
  ).toBeVisible();
});

test("cancel during content verification ignores a late ready response and clears the next draft", async ({
  page,
}) => {
  const f = await mount(page, { blockComplete: true });
  await choose(page);
  await page.getByRole("button", { name: "上載並核對", exact: true }).click();
  await expect(page.getByText("核對檔案內容…", { exact: true })).toBeVisible();
  await expect
    .poll(() => f.commands.some((c) => c.body.action === "complete"))
    .toBe(true);
  const complete = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.action === "complete",
  );
  await page.getByRole("button", { name: "取消上載", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  f.release();
  await complete;
  await page.getByRole("button", { name: "加入附件", exact: true }).click();
  await expect(
    page.getByText("選擇圖片、影片或文件", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "傳送附件", exact: true }),
  ).toHaveCount(0);
  expect(f.commands.filter((c) => c.body.action === "send")).toHaveLength(0);
});
test("an unknown send preserves its request and stays reconcilable after new sends become unavailable", async ({
  page,
}) => {
  const f = await mount(page, { sendUnknown: true });
  await choose(page);
  await page.getByRole("button", { name: "上載並核對", exact: true }).click();
  await page.getByRole("button", { name: "傳送附件", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對傳送結果", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "關閉視窗", exact: true }).click();
  await page.getByRole("button", { name: "暫停新發送", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對附件傳送", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "核對附件傳送", exact: true }).click();
  await page.getByRole("button", { name: "核對傳送結果", exact: true }).click();
  await expect(
    page.getByText("平台已接收；送達狀態會繼續更新。", { exact: true }),
  ).toBeVisible();
  expect(f.commands.filter((c) => c.body.action === "send")).toHaveLength(1);
  expect(f.commands.at(-1)?.body).toMatchObject({
    action: "receipt",
    clientId: f.lastClient(),
  });
});
test("pending attachments are actor-scoped and legacy unscoped metadata is discarded", async ({
  page,
}) => {
  const legacyKey = `convelta-media:${companyId}:whatsapp:${sourceId}`;
  await page.addInitScript((key) => {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        id: "legacy",
        filename: "其他同事私密檔案.pdf",
        clientId: "legacy-request",
      }),
    );
  }, legacyKey);
  const f = await mount(page, { sendUnknown: true });
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key), legacyKey))
    .toBeNull();
  await expect(page.getByText("其他同事私密檔案.pdf")).toHaveCount(0);
  await choose(page);
  await page.getByRole("button", { name: "上載並核對", exact: true }).click();
  await page.getByRole("button", { name: "傳送附件", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對傳送結果", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "關閉視窗", exact: true }).click();
  await page.getByRole("button", { name: "切換測試用戶", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對附件傳送", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "加入附件", exact: true }).click();
  await expect(
    page.getByText("選擇圖片、影片或文件", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("資料.pdf", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "關閉視窗", exact: true }).click();
  await page.getByRole("button", { name: "切換測試用戶", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對附件傳送", exact: true }),
  ).toBeEnabled();
  expect(f.commands.filter((c) => c.body.action === "send")).toHaveLength(1);
  expect(f.commands.filter((c) => c.body.action === "receipt")).toHaveLength(0);
});
for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
] as const)
  test(`attachment ${name} dialog remains readable, keyboard accessible and within viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mount(page);
    await choose(page);
    await expect(
      page.getByRole("dialog", { name: "傳送附件", exact: true }),
    ).toBeVisible();
    const violations = (
      await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
    ).violations;
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`attachment-${name}.png`),
      fullPage: true,
    });
  });
