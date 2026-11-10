import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function launch(page: Page) {
  await page.goto("/?view=broadcasts");
  await page.getByRole("button", { name: "新增推播", exact: true }).click();
  await page.getByLabel("推播名稱", { exact: true }).fill("體驗推播");
  await page.getByRole("button", { name: /開始示範推播/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "確認模擬推播", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "體驗推播 · 成效" }),
  ).toBeVisible();
}
async function report(page: Page) {
  await page
    .getByRole("button", { name: "推播與成效", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "推播成效", exact: true }).click();
}
test("broadcast → customer reply → pending intake → staff confirmation → arrival, persisted and auditable", async ({
  page,
}, info) => {
  await launch(page);
  const row = page.locator(".bc-table-wrap tbody tr").first();
  await row.getByRole("button", { name: "已讀", exact: true }).click();
  await row.getByRole("button", { name: "體驗回覆", exact: true }).click();
  await expect(page.getByText("推播來源：體驗推播")).toBeVisible();
  await page
    .getByLabel("客戶體驗訊息", { exact: true })
    .fill("我有興趣，想預約。");
  await page
    .getByRole("button", { name: "傳送客戶體驗訊息", exact: true })
    .click();
  await page.getByRole("button", { name: "填預約意向", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "提交預約意向", exact: true })
    .click();
  await expect(page.getByText("預約意向已建立，等待同事核實。")).toBeVisible();
  await report(page);
  expect(
    await page
      .locator(".bc-metrics article")
      .filter({ hasText: "已核實預約" })
      .innerText(),
  ).toContain("0");
  await page
    .getByRole("button", { name: "體驗回覆", exact: true })
    .first()
    .click();
  await page.getByLabel("我已核實療程、名額、時間及費用安排（示範）").check();
  await page.getByRole("button", { name: "同事核實預約", exact: true }).click();
  await page
    .getByRole("button", { name: "模擬到提醒時間", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("已模擬到提醒時間");
  await report(page);
  const first = page.locator(".bc-table-wrap tbody tr").first();
  await first.getByRole("button", { name: "記錄到店", exact: true }).click();
  await expect(
    page.locator(".bc-metrics article").filter({ hasText: "已核實預約" }),
  ).toContainText("1");
  await expect(
    page.locator(".bc-metrics article").filter({ hasText: "人手到店" }),
  ).toContainText("1");
  await page.getByText("事件明細 · 可追溯來源", { exact: true }).click();
  await expect(
    page.getByText("同事人手示範記錄", { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("broadcast-performance.png"),
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "推播成效", exact: true }).click();
  await expect(
    page.locator(".bc-metrics article").filter({ hasText: "人手到店" }),
  ).toContainText("1");
});
test("opt out is reflected in consent and blocks a later campaign", async ({
  page,
}) => {
  await launch(page);
  await page
    .getByRole("button", { name: "體驗回覆", exact: true })
    .first()
    .click();
  await page.getByLabel("客戶體驗訊息", { exact: true }).fill("STOP");
  await page
    .getByRole("button", { name: "傳送客戶體驗訊息", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("已記錄退訂");
  await report(page);
  await expect(page.locator(".bc-table-wrap tbody tr").first()).toContainText(
    "已退訂",
  );
  await page.getByRole("button", { name: "新增推播", exact: true }).click();
  await expect(
    page.getByText("已加入停止聯絡名單", { exact: false }).first(),
  ).toBeVisible();
});
test("CSV import normalizes and deduplicates without granting consent", async ({
  page,
}) => {
  await page.goto("/?view=broadcasts");
  await page.getByRole("button", { name: "聯絡與同意", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "demo.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name,phone\n新匯入客人,91234567\n重複電話,+85291234567\n錯誤電話,123",
    ),
  });
  const row = page.getByRole("row").filter({ hasText: "新匯入客人" });
  await expect(row).toContainText("+85291234567");
  await expect(row).toContainText("未有同意");
  await expect(
    page.getByRole("row").filter({ hasText: "重複電話" }),
  ).toHaveCount(0);
});
test("AI endpoint is protected and unavailable model is clearly disclosed", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/assistant", {
    headers: { Origin: "http://127.0.0.1:3038" },
    data: {},
  });
  expect(response.status()).toBe(401);
  const cross = await request.post("/api/demo-access", {
    headers: { Origin: "https://invalid.example" },
    data: { code: "bad" },
  });
  expect(cross.status()).toBe(403);
  await page.goto("/");
  await page
    .getByRole("button", { name: "啟用 AI", exact: false })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "此部署尚未配置模型連線",
  );
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "啟用 AI 體驗", exact: true }),
  ).toBeDisabled();
});
for (const view of ["experience", "broadcasts", "inbox", "bot", "flows"])
  test(`${view} desktop accessibility and no console errors`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/?view=${view}`);
    await expect(page.locator(".fh-app")).toBeVisible();
    if (view === "broadcasts") await launch(page);
    if (view === "flows")
      await expect(page.locator(".react-flow__node").first()).toBeVisible();
    const audit = await new AxeBuilder({ page }).analyze();
    expect(
      audit.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${view}-desktop.png`) });
  });
for (const view of ["experience", "broadcasts", "inbox", "flows"])
  test(`${view} mobile remains inside viewport`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?view=${view}`);
    if (view === "broadcasts") await launch(page);
    await expect(page.locator(".fh-app")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(392);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(
      audit.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${view}-mobile.png`) });
  });
