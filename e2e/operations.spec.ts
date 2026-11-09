import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("operating inbox filters combine and survive refresh without losing the table", async ({
  page,
}, testInfo) => {
  await page.goto("/crm/acceptance");
  await expect(page.getByRole("heading", { name: "業務收件匣" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Demo Casey/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("inbox-desktop.png") });
  await page
    .getByRole("combobox", { name: "品牌", exact: true })
    .selectOption("demo-studio");
  await expect(page.getByRole("link", { name: /Demo Morgan/ })).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "搜尋查詢" })
    .fill("+1 202 555 0102");
  await expect(page.getByRole("link", { name: /Demo Jordan/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Demo Casey/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("searchbox", { name: "搜尋查詢" })).toHaveValue(
    "+1 202 555 0102",
  );
  await expect(page.getByRole("link", { name: /Demo Jordan/ })).toBeVisible();
  await page.getByRole("button", { name: "重設" }).click();
  await page.getByRole("button", { name: /到期跟進/ }).click();
  await expect(page.getByRole("link", { name: /Demo Jordan/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Demo Casey/ })).toHaveCount(0);
});
test("campaign preview blocks unverified recipients and has no send action", async ({
  page,
}, testInfo) => {
  const outgoing: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
      outgoing.push(request.url());
  });
  await page.goto("/crm/acceptance?view=campaigns");
  await page
    .getByRole("combobox", { name: "推播品牌" })
    .selectOption("demo-studio");
  await expect(
    page
      .locator(".ops-stat")
      .filter({ hasText: "已具備發送資格" })
      .locator("strong"),
  ).toHaveText("0");
  await expect(
    page.getByRole("button", { name: "批准並排入發送佇列" }),
  ).toBeDisabled();
  await expect(page.getByText("未有有效行銷同意紀錄")).toHaveCount(2);
  await expect(page.getByText("客戶／品牌權限未驗證")).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath("campaign-preview.png"),
    fullPage: true,
  });
  expect(outgoing).toEqual([]);
});
test("workflow simulation is scoped, editable and cannot write follow-ups", async ({
  page,
}, testInfo) => {
  await page.goto("/crm/acceptance?view=automations");
  await page
    .getByRole("combobox", { name: "自動化品牌" })
    .selectOption("demo-studio");
  await page.getByRole("button", { name: "執行模擬" }).click();
  await expect(
    page.getByRole("region", { name: "規則模擬結果" }),
  ).toContainText("Demo Jordan");
  await expect(
    page.getByRole("region", { name: "規則模擬結果" }),
  ).not.toContainText("Demo Morgan");
  await page.screenshot({
    path: testInfo.outputPath("automation-studio.png"),
    fullPage: true,
  });
  await page.getByRole("spinbutton", { name: "跟進小時" }).fill("0");
  await expect(page.getByRole("region", { name: "規則模擬結果" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "執行模擬" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "1 至 720" }),
  ).toBeVisible();
});
test("personalized saved replies stay editable and direct send stays disabled", async ({
  page,
}) => {
  await page.goto("/crm/acceptance?view=reply");
  await page.getByRole("button", { name: "了解需要" }).click();
  await expect(page.getByRole("textbox", { name: "回覆內容" })).toHaveValue(
    /Demo Casey/,
  );
  await expect(page.getByRole("textbox", { name: "回覆內容" })).toHaveValue(
    /皮膚護理/,
  );
  await expect(
    page.getByRole("button", { name: "傳送", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "回覆內容" })
    .fill("{{missing}} 尚未填寫");
  await page.getByRole("button", { name: "複製回覆" }).click();
  await expect(page.getByRole("status")).toContainText("請先填好全部");
});
test("mobile navigation is keyboard accessible and page width stays contained", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/crm/acceptance");
  await expect(
    page
      .getByRole("navigation", { name: "CRM 主導航" })
      .getByRole("link", { name: "受眾與推播" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Demo Jordan/ })).toBeVisible();
  await page.getByRole("link", { name: "受眾與推播" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跟進自動化" })).toBeFocused();
  const size = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(size.width).toBeLessThanOrEqual(size.viewport);
  await page.screenshot({
    path: testInfo.outputPath("inbox-mobile.png"),
    fullPage: true,
  });
});
test("the product backlog retains explicit unfinished system cards and verified-source links", async ({
  page,
}) => {
  await page.goto("/crm/system");
  await expect(
    page.getByRole("heading", { name: "CRM 功能藍圖", exact: true }),
  ).toBeVisible();
  await expect(page.locator("article")).toHaveCount(18);
  await expect(
    page.getByText("未有登入後台逐項驗收", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "官方功能來源" }).first(),
  ).toHaveAttribute("href", /omnichat\.ai/);
});

test("primary operations surfaces meet automated accessibility checks", async ({
  page,
}) => {
  for (const view of ["inbox", "campaigns", "automations", "reply"]) {
    await page.goto(`/crm/acceptance?view=${view}`);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations, `${view} accessibility`).toEqual([]);
  }
});

test("unavailable case data is unknown, never zero or unassigned", async ({
  page,
}) => {
  await page.goto(
    "/crm/acceptance?view=unavailable&queue=follow_up_due&owner=unassigned",
  );
  const due = page.getByRole("button", { name: /到期跟進/ });
  await expect(due).toBeDisabled();
  await expect(due).toContainText("—");
  await expect(
    page.getByRole("combobox", { name: "負責人", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("link", { name: /Demo Jordan/ })).toBeVisible();
  await expect(
    page.getByText("分派與跟進資料未能確認", { exact: false }),
  ).toBeVisible();
});
