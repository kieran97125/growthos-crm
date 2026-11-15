import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  actor,
  company,
  customer,
  fixturePath,
  integrationBundle,
  mountIntegration,
  secondWebsiteThread,
  socialThread,
  websiteThread,
  type CapturedRequest,
} from "./inbox-expansion-fixture";

let bundle = "";
test.beforeAll(async () => {
  bundle = await integrationBundle();
});

async function selectSocial(page: Page) {
  await page.getByRole("button", { name: /Synthetic social customer/ }).click();
  await expect(page.getByLabel("回覆草稿", { exact: true })).toBeVisible();
}
async function selectWebsite(page: Page) {
  await page.getByRole("button", { name: "網站訊息", exact: true }).click();
  await page.getByRole("button", { name: /Synthetic website visitor/ }).click();
  await expect(page.getByLabel("回覆網站訪客", { exact: true })).toBeVisible();
}
function socialPolls(captures: CapturedRequest[]) {
  return captures.filter(
    (c) =>
      c.path.endsWith("/inbox") ||
      (c.path.endsWith("/editor") &&
        ["read", "heartbeat"].includes(String(c.body?.mode))),
  );
}
function websitePolls(captures: CapturedRequest[]) {
  return captures.filter(
    (c) => c.path.endsWith("/web-chat/threads") && c.method === "GET",
  );
}
function customerWrites(captures: CapturedRequest[]) {
  return captures.filter(
    (c) => c.method !== "GET" && !c.path.endsWith("/editor"),
  );
}

test("actual company inbox preserves each channel draft while hidden polls and customer context stop", async ({
  page,
}) => {
  const f = await mountIntegration(page, bundle);
  await selectSocial(page);
  await page
    .getByLabel("回覆草稿", { exact: true })
    .fill("只屬於社交客戶嘅未送出草稿");
  await expect(
    page.getByRole("link", { name: "切換至 POS", exact: true }),
  ).toHaveAttribute("href", new RegExp(`contact=${customer}`));
  await selectWebsite(page);
  await expect(
    page.getByRole("link", { name: "切換至 POS", exact: true }),
  ).toHaveAttribute("href", `/company/${company}/pos`);
  await expect(page.getByText("未連結客戶", { exact: true })).toBeVisible();
  await page
    .getByLabel("回覆網站訪客", { exact: true })
    .fill("只屬於網站訪客嘅未送出草稿");
  await page.clock.runFor(1600);
  const beforeSocial = socialPolls(f.captures).length;
  const beforeWebsite = websitePolls(f.captures).length;
  await page.clock.runFor(31000);
  await expect
    .poll(() => websitePolls(f.captures).length)
    .toBeGreaterThan(beforeWebsite);
  expect(socialPolls(f.captures)).toHaveLength(beforeSocial);
  const lastContext = f.captures
    .filter((c) => c.path.endsWith("/copilot"))
    .at(-1)
    ?.query.get("context");
  expect(lastContext).toBeTruthy();
  expect(JSON.parse(lastContext!)).not.toHaveProperty("customerId");
  await page.getByRole("button", { name: "社交訊息", exact: true }).click();
  await expect(page.getByLabel("回覆草稿", { exact: true })).toHaveValue(
    "只屬於社交客戶嘅未送出草稿",
  );
  expect(new URL(page.url()).searchParams.get("provider")).toBe("meta");
  expect(new URL(page.url()).searchParams.get("thread")).toBe(socialThread);
  await expect(
    page.getByRole("link", { name: "切換至 POS", exact: true }),
  ).toHaveAttribute("href", new RegExp(`contact=${customer}`));
  await page.clock.runFor(1000);
  const stoppedWebsite = websitePolls(f.captures).length;
  await page.clock.runFor(16000);
  expect(websitePolls(f.captures)).toHaveLength(stoppedWebsite);
  await page.getByRole("button", { name: "網站訊息", exact: true }).click();
  await expect(page.getByLabel("回覆網站訪客", { exact: true })).toHaveValue(
    "只屬於網站訪客嘅未送出草稿",
  );
  expect(new URL(page.url()).searchParams.get("provider")).toBe("website");
  expect(new URL(page.url()).searchParams.get("thread")).toBe(websiteThread);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Synthetic website visitor",
      exact: true,
    }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("thread")).toBe(websiteThread);
  expect(customerWrites(f.captures)).toEqual([]);
  expect(f.unexpected).toEqual([]);
});

test("unknown website reply survives reload, freezes only its conversation and reconciles the same command after switching visitors", async ({
  page,
}) => {
  let lost = false;
  const f = await mountIntegration(page, bundle, {
    initialWebsite: true,
    secondWebsite: true,
    handler: async (request, route) => {
      if (
        !lost &&
        request.path.endsWith("/web-chat/threads") &&
        request.method === "POST" &&
        request.body?.threadId === websiteThread &&
        request.body?.action === "reply"
      ) {
        lost = true;
        // The server committed, but the browser never saw its acknowledgement.
        f.websiteConversation.messages.push({
          id: String(request.body.commandId),
          sequence: 2,
          body: String(request.body.body),
          direction: "outgoing",
          actorName: "Synthetic owner",
          createdAt: new Date().toISOString(),
        });
        f.websiteConversation.thread.revision++;
        await route.abort("failed");
        return true;
      }
      return false;
    },
  });
  const firstReply = "第一位訪客嘅唯一一則回覆";
  await page.getByLabel("回覆網站訪客", { exact: true }).fill(firstReply);
  await page.getByRole("button", { name: "發送回覆", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對同一操作", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("回覆網站訪客", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "結束對話", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "連結已有客戶", exact: true }),
  ).toBeDisabled();
  const originalCommand = f.captures.find(
    (c) => c.method === "POST" && c.body?.threadId === websiteThread,
  )!.body;
  await page.reload();
  await expect(
    page.getByRole("button", { name: "核對同一操作", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("回覆網站訪客", { exact: true })).toBeDisabled();
  expect(
    f.captures.filter(
      (c) => c.method === "POST" && c.body?.threadId === websiteThread,
    ),
  ).toHaveLength(1);
  await page.getByRole("button", { name: /Another website visitor/ }).click();
  await expect(page.getByLabel("回覆網站訪客", { exact: true })).toBeEnabled();
  await page
    .getByLabel("回覆網站訪客", { exact: true })
    .fill("第二位訪客可以獨立處理");
  await page.getByRole("button", { name: "發送回覆", exact: true }).click();
  await expect(
    page.getByText("第二位訪客可以獨立處理", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Synthetic website visitor/ }).click();
  await expect(page.getByLabel("回覆網站訪客", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "核對同一操作", exact: true }).click();
  await expect(page.getByLabel("回覆網站訪客", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("回覆網站訪客", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByText(firstReply, { exact: true })).toHaveCount(1);
  const firstRequests = f.captures.filter(
    (c) => c.method === "POST" && c.body?.threadId === websiteThread,
  );
  expect(firstRequests).toHaveLength(2);
  expect(firstRequests[1].body).toEqual(originalCommand);
  expect(
    f.websiteConversation.messages.filter((m) => m.body === firstReply),
  ).toHaveLength(1);
  expect(
    f.captures.filter(
      (c) => c.method === "POST" && c.body?.threadId === secondWebsiteThread,
    ),
  ).toHaveLength(1);
  expect(f.unexpected).toEqual([]);
});

for (const returnToFirst of [false, true]) {
  test(`late website history response stays isolated after ${returnToFirst ? "A to B to A" : "A to B"} selection`, async ({
    page,
  }) => {
    let olderRoute: Route | undefined;
    const f = await mountIntegration(page, bundle, {
      initialWebsite: true,
      secondWebsite: true,
      websiteHasOlder: true,
      handler: async (request, route) => {
        if (
          request.path.endsWith("/web-chat/threads") &&
          request.query.has("beforeSequence")
        ) {
          olderRoute = route;
          return true;
        }
        return false;
      },
    });
    await page.getByRole("button", { name: "較早訊息", exact: true }).click();
    await expect.poll(() => Boolean(olderRoute)).toBe(true);
    await page.getByRole("button", { name: /Another website visitor/ }).click();
    await expect(
      page.getByText("另一位訪客嘅私人查詢", { exact: true }).last(),
    ).toBeVisible();
    if (returnToFirst)
      await page
        .getByRole("button", { name: /Synthetic website visitor/ })
        .click();
    await olderRoute!.fulfill({
      json: {
        ...f.websiteConversation,
        messages: [
          {
            id: "8ccccccc-cccc-4ccc-8ccc-cccccccccccc",
            sequence: 1,
            body: "只屬於第一段網站對話嘅遲到歷史",
            direction: "incoming",
            actorName: null,
            createdAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      },
    });
    await page.clock.runFor(1600);
    await expect(
      page.getByText("只屬於第一段網站對話嘅遲到歷史", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: returnToFirst
          ? "Synthetic website visitor"
          : "Another website visitor",
        exact: true,
      }),
    ).toBeVisible();
    expect(f.unexpected).toEqual([]);
  });
}

test("website selection is deep-linked and survives a real page reload without reading a hidden social inbox", async ({
  page,
}) => {
  const f = await mountIntegration(page, bundle, { initialWebsite: true });
  await expect(page.getByLabel("回覆網站訪客", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "網站訊息", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(socialPolls(f.captures)).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Synthetic website visitor",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("回覆網站訪客", { exact: true })).toBeEnabled();
  expect(new URL(page.url()).searchParams.get("thread")).toBe(websiteThread);
  expect(socialPolls(f.captures)).toEqual([]);
  await page.getByRole("button", { name: "社交訊息", exact: true }).click();
  await selectSocial(page);
  await selectWebsite(page);
  expect(new URL(page.url()).searchParams.get("provider")).toBe("website");
  expect(new URL(page.url()).searchParams.get("thread")).toBe(websiteThread);
  await page.reload();
  await expect(page.getByLabel("回覆網站訪客", { exact: true })).toBeVisible();
  expect(customerWrites(f.captures)).toEqual([]);
  expect(f.unexpected).toEqual([]);
});

for (const [condition, options] of [
  ["viewer", { viewer: true }],
  ["closed service window", { windowClosed: true }],
  ["unresolved provider result", { unresolved: true }],
] as const) {
  test(`main inbox attachment sending respects ${condition}`, async ({
    page,
  }) => {
    const f = await mountIntegration(page, bundle, options);
    await selectSocial(page);
    if (!("viewer" in options))
      await page
        .getByLabel("回覆草稿", { exact: true })
        .fill("一則尚未發送嘅有效回覆");
    await expect(
      page.getByRole("button", { name: "加入附件", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "傳送回覆", exact: true }),
    ).toBeDisabled();
    expect(customerWrites(f.captures)).toEqual([]);
    expect(f.unexpected).toEqual([]);
  });
}

test("main company inbox exposes private attachments without spending AI or sending a message", async ({
  page,
}) => {
  const f = await mountIntegration(page, bundle);
  await selectSocial(page);
  await expect(
    page.getByRole("button", { name: "加入附件", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Synthetic reference.png", { exact: true }),
  ).toBeVisible();
  const mediaReads = f.captures.filter((c) => c.path.endsWith("/media"));
  expect(mediaReads.length).toBeGreaterThan(0);
  expect(
    mediaReads.every(
      (c) => c.method === "GET" && c.query.get("source") === "meta",
    ),
  ).toBe(true);
  expect(customerWrites(f.captures)).toEqual([]);
  expect(f.unexpected).toEqual([]);
});

test("cancelling an unreserved local attachment clears the selection when no server asset exists", async ({
  page,
}) => {
  const f = await mountIntegration(page, bundle, {
    handler: async (request, route) => {
      if (
        request.path.endsWith("/media") &&
        request.body?.action === "cancel"
      ) {
        await route.fulfill({ status: 404, json: { error: "附件尚未保留。" } });
        return true;
      }
      return false;
    },
  });
  await selectSocial(page);
  await page.getByRole("button", { name: "加入附件", exact: true }).click();
  await page.locator(`#cm-file-${socialThread}`).setInputFiles({
    name: "Local-only.png",
    mimeType: "image/png",
    buffer: Buffer.from("synthetic local file; never uploaded"),
  });
  const dialog = page.getByRole("dialog", { name: "傳送附件", exact: true });
  await expect(
    dialog.getByText("Local-only.png", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "移除附件", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "加入附件", exact: true }).click();
  await expect(
    page.getByText("選擇圖片、影片或文件", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Local-only.png", { exact: true })).toHaveCount(
    0,
  );
  const mediaWrites = f.captures.filter(
    (c) => c.path.endsWith("/media") && c.method === "POST",
  );
  expect(mediaWrites).toHaveLength(1);
  expect(mediaWrites[0].body?.action).toBe("cancel");
  expect(f.unexpected).toEqual([]);
});

test("pending attachment receipt remains accessible after a closed service window and only reconciles the original send", async ({
  page,
}) => {
  const pendingClient = "8ddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const assetId = "8eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await page.addInitScript(
    ({ key, clientId, id }) => {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          id,
          filename: "Pending evidence.png",
          mimeType: "image/png",
          bytes: 1024,
          asset: {
            id,
            kind: "image",
            filename: "Pending evidence.png",
            mimeType: "image/png",
            bytes: 1024,
            state: "ready",
          },
          receipt: null,
          clientId,
        }),
      );
    },
    {
      key: `convelta-media:${actor}:${company}:meta:${socialThread}`,
      clientId: pendingClient,
      id: assetId,
    },
  );
  const f = await mountIntegration(page, bundle, {
    windowClosed: true,
    unresolved: true,
    handler: async (request, route) => {
      if (
        request.path.endsWith("/media") &&
        request.body?.action === "receipt"
      ) {
        await route.fulfill({
          json: {
            receipt: {
              clientId: pendingClient,
              messageId: "8fffffff-ffff-4fff-8fff-ffffffffffff",
              state: "accepted",
              replayed: true,
              errorCode: null,
            },
          },
        });
        return true;
      }
      return false;
    },
  });
  await selectSocial(page);
  const check = page.getByRole("button", { name: "核對附件傳送", exact: true });
  await expect(check).toBeEnabled();
  await check.click();
  await page.getByRole("button", { name: "核對傳送結果", exact: true }).click();
  await expect(
    page.getByText("平台已接收；送達狀態會繼續更新。", { exact: true }),
  ).toBeVisible();
  const mediaWrites = f.captures.filter(
    (c) => c.path.endsWith("/media") && c.method === "POST",
  );
  expect(mediaWrites).toHaveLength(1);
  expect(mediaWrites[0].body).toEqual({
    brandId: "main",
    source: "meta",
    sourceId: socialThread,
    action: "receipt",
    clientId: pendingClient,
  });
  expect(f.unexpected).toEqual([]);
});

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`actual source switch and both inboxes stay styled and accessible on ${name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const f = await mountIntegration(page, bundle);
    await selectSocial(page);
    await expect(
      page.getByRole("button", { name: "加入附件", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`inbox-social-${name}.png`),
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await selectWebsite(page);
    await expect(
      page.getByRole("navigation", { name: "CRM 功能", exact: true }),
    ).toBeVisible();
    const violations = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations;
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`inbox-website-${name}.png`),
      fullPage: true,
    });
    expect(customerWrites(f.captures)).toEqual([]);
    expect(f.unexpected).toEqual([]);
  });
}

test("read-only website entry keeps the same company header and prevents visitor replies", async ({
  page,
}) => {
  const f = await mountIntegration(page, bundle, {
    initialWebsite: true,
    viewer: true,
  });
  await expect(page.getByLabel("回覆網站訪客", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "發送回覆", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "切換至 POS", exact: true }),
  ).toHaveAttribute("href", `/company/${company}/pos`);
  await page.clock.runFor(16000);
  expect(customerWrites(f.captures)).toEqual([]);
  expect(f.unexpected).toEqual([]);
  expect(new URL(page.url()).pathname).toBe(fixturePath);
});
