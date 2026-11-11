import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("dual purchase has one prominent switch and separate product navigation, preserving a customer handoff", async ({
  page,
}, info) => {
  await page.goto("/preview/crm?plan=both");
  await expect(
    page.getByRole("button", { name: "切換至 POS", exact: true }),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("navigation", { name: "CRM 功能" })
      .getByRole("button", { name: /POS/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "開啟客戶 POS" })).toHaveCount(
    0,
  );
  const name = await page.locator(".fh-contact-summary h3").innerText();
  await page.getByRole("button", { name: "切換至 POS", exact: true }).click();
  await expect(page).toHaveURL(/\/preview\/pos\?plan=both/);
  await expect(
    page.getByRole("navigation", { name: "POS 工作區" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "CRM 功能" })).toBeHidden();
  await expect(page.getByLabel("收銀客戶", { exact: true })).toContainText(
    name,
  );
  await expect(
    page.getByRole("button", { name: "切換至 CRM", exact: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("smartvolt-product-switch-pos.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "切換至 CRM", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "CRM 功能" }),
  ).toBeVisible();
  await expect(page.locator(".fh-contact-summary h3")).toHaveText(name);
});
test("CRM-only purchase hides POS and denies canonical and legacy POS deep links", async ({
  page,
}, info) => {
  await page.goto("/preview/crm?plan=crm");
  await expect(
    page.getByRole("navigation", { name: "CRM 功能" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "切換至 POS", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "POS 工作區" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("smartvolt-crm-only-desktop.png"),
    fullPage: true,
  });
  for (const url of ["/preview/pos?plan=crm", "/preview?view=pos&plan=crm"]) {
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: "公司方案未包含 POS" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "POS 工作區" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "開啟 CRM", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "CRM 功能" }),
    ).toBeVisible();
  }
});
test("POS-only customer can create a walk-in, sell and view a customer without any CRM entry or sidebar", async ({
  page,
}, info) => {
  await page.goto("/preview/pos?plan=pos");
  await expect(
    page.getByRole("heading", { name: "POS 營運工作台", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /切換至 CRM/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "CRM 功能" })).toHaveCount(
    0,
  );
  await page
    .getByRole("navigation", { name: "POS 工作區" })
    .getByRole("button", { name: "收銀台", exact: true })
    .click();
  await page.getByRole("button", { name: "新增客戶", exact: true }).click();
  await page.getByLabel("新增客戶姓名").fill("POS 獨立客戶");
  await page.getByLabel("新增客戶電話").fill("61234567");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "建立客戶", exact: true })
    .click();
  await expect(page.getByLabel("收銀客戶", { exact: true })).toContainText(
    "POS 獨立客戶",
  );
  await page.locator(".sv-product-product").click();
  await page.getByRole("button", { name: /登記收款/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "現金", exact: true })
    .click();
  await page.getByLabel("我已核實實際收到款項（示範）").check();
  await page.getByRole("button", { name: "確認收款入帳" }).click();
  await page.getByRole("button", { name: "查看客戶資料", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "POS 客戶資料", exact: true }),
  ).toContainText("POS 獨立客戶");
  await expect(page.getByRole("dialog")).toContainText("已付清");
  await page.screenshot({
    path: info.outputPath("smartvolt-pos-only-customer-dialog.png"),
    fullPage: true,
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "關閉視窗" })
    .click();
  expect(
    (
      await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, html: n.html })),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("smartvolt-pos-only-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath("smartvolt-pos-only-mobile.png"),
    fullPage: true,
  });
  await page.goto("/preview/crm?plan=pos");
  await expect(
    page.getByRole("heading", { name: "公司方案未包含 CRM" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "CRM 功能" })).toHaveCount(
    0,
  );
});
test("switching purchase scenarios never deletes retained data and never carries an unavailable product mount", async ({
  page,
}) => {
  await page.goto("/preview/pos?plan=both");
  await expect(
    page.getByRole("heading", { name: "POS 營運工作台", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "POS 工作區" })
    .getByRole("button", { name: "交易記錄", exact: true })
    .click();
  await expect(page.locator(".sv-table tbody tr")).toHaveCount(1);
  await page.getByLabel("體驗購買方案").selectOption("crm");
  await expect(
    page.getByRole("navigation", { name: "CRM 功能" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "切換至 POS", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("體驗購買方案").selectOption("pos");
  await expect(page.getByRole("navigation", { name: "CRM 功能" })).toHaveCount(
    0,
  );
  await page
    .getByRole("navigation", { name: "POS 工作區" })
    .getByRole("button", { name: "交易記錄", exact: true })
    .click();
  await expect(page.locator(".sv-table tbody tr")).toHaveCount(1);
});
