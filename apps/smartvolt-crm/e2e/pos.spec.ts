import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function start(page: Page) {
  await page.goto("/preview?view=pos");
  await expect(
    page.getByRole("heading", { name: "POS 營運工作台", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sv-appointments tbody tr")).toHaveCount(5);
}
async function tab(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "POS 工作區" })
    .getByRole("button", { name, exact: false })
    .click();
}
async function chooseCustomer(page: Page) {
  const sel = page.getByLabel("收銀客戶", { exact: true });
  const options = await sel.locator("option").all();
  const value = await options[1].getAttribute("value");
  await sel.selectOption(value!);
  return value!;
}
async function cashPayment(page: Page, half = false) {
  await page
    .getByRole("button", { name: half ? /登記收款/ : /登記收款|登記尾數/ })
    .last()
    .click();
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: "現金", exact: true }).click();
  if (half) await d.getByRole("button", { name: "收一半訂金" }).click();
  await d.getByLabel("我已核實實際收到款項（示範）").check();
  await d.getByRole("button", { name: "確認收款入帳" }).click();
  await expect(d).not.toBeVisible();
}
async function readState(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("smartvolt:preview:preview-aurora:v1")!),
  );
}
test("CRM and POS reciprocal entries retain customer, draft and cart context", async ({
  page,
}, info) => {
  await page.goto("/preview?view=inbox");
  const composer = page.locator(".fh-composer textarea");
  await composer.fill("返到 CRM 繼續跟進");
  const name = await page.locator(".fh-contact-summary h3").innerText();
  await page.getByRole("button", { name: "開啟客戶 POS" }).click();
  await expect(page.getByLabel("收銀客戶", { exact: true })).toContainText(
    name,
  );
  await page.locator(".sv-product-service").first().click();
  await expect(page.locator(".sv-cart-line")).toHaveCount(1);
  await page.getByRole("button", { name: "返回 CRM", exact: true }).click();
  await expect(composer).toHaveValue("返到 CRM 繼續跟進");
  await expect(page.locator(".fh-contact-summary h3")).toHaveText(name);
  await page
    .getByRole("button", { name: "POS 營運工作台", exact: true })
    .click();
  await expect(page.locator(".sv-cart-line")).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("smartvolt-pos-cashier-desktop.png"),
    fullPage: true,
  });
});
test("cashier deposit and balance persist once, issue a package only after full payment and preserve old prices", async ({
  page,
}, info) => {
  await start(page);
  await tab(page, "收銀台");
  await chooseCustomer(page);
  await page.locator(".sv-product-package").click();
  await cashPayment(page, true);
  await expect(page.locator(".sv-cart-totals")).toContainText("2,100");
  let state = await readState(page);
  const order = state.pos.orders.at(-1);
  expect(
    state.pos.entitlements.filter(
      (p: { orderId: string }) => p.orderId === order.id,
    ),
  ).toHaveLength(0);
  await cashPayment(page);
  state = await readState(page);
  expect(
    state.pos.payments.filter(
      (p: { orderId: string }) => p.orderId === order.id,
    ),
  ).toHaveLength(2);
  expect(
    state.pos.entitlements.filter(
      (p: { orderId: string }) => p.orderId === order.id,
    ),
  ).toHaveLength(1);
  await page.reload();
  await tab(page, "交易記錄");
  await page
    .locator(".sv-table tbody tr")
    .first()
    .getByRole("button", { name: "明細", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("已付清");
  await page.screenshot({
    path: info.outputPath("smartvolt-pos-receipt.png"),
    fullPage: true,
  });
});
test("appointments check in, redeem once, reverse with reason and return the right customer to CRM", async ({
  page,
}, info) => {
  await start(page);
  const row = page.locator(".sv-appointments tbody tr").first();
  await row.getByRole("button", { name: /預約$/ }).click();
  const d = page.getByRole("dialog");
  const name = await d.locator(".sv-detail-customer h3").innerText();
  await d.getByRole("button", { name: "登記到店", exact: true }).click();
  await d.getByLabel("核銷套票", { exact: true }).selectOption({ index: 1 });
  await d.getByLabel("我確認服務已完成，扣減一次套票").check();
  await d.getByRole("button", { name: "核銷一次並完成" }).click();
  await expect(d.locator(".sv-detail-customer")).toContainText("已完成");
  await expect(d.getByRole("button", { name: "核銷一次並完成" })).toHaveCount(
    0,
  );
  await d.getByRole("button", { name: "撤銷核銷", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("更正原因")
    .fill("誤按核銷，已核對服務未完成");
  await page
    .getByLabel("我已核對原核銷，確認退回一次套票並將預約還原為已到店")
    .check();
  await page.getByRole("button", { name: "確認撤銷核銷" }).click();
  const state = await readState(page);
  expect(state.pos.redemptions).toHaveLength(2);
  await tab(page, "套票會員");
  await expect(
    page.locator(".sv-package-balance strong").first(),
  ).toContainText("10");
  await page.screenshot({
    path: info.outputPath("smartvolt-pos-packages.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "客戶 CRM", exact: true })
    .first()
    .click();
  await expect(page.locator(".fh-contact-summary h3")).toHaveText(name);
});
test("calendar renders real appointments; new appointment checks capacity and projects into CRM", async ({
  page,
}, info) => {
  await start(page);
  await tab(page, "預約日曆");
  await expect(page.locator(".sv-calendar-event")).toHaveCount(5);
  await page.screenshot({
    path: info.outputPath("smartvolt-pos-calendar.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "新增預約", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("預約客戶", { exact: true }).selectOption({ index: 1 });
  await d.getByLabel("預約日期及時間").fill("2026-12-01T10:00");
  await d.getByRole("button", { name: "建立預約", exact: true }).click();
  await expect(d).not.toBeVisible();
  const state = await readState(page);
  const a = state.pos.appointments.at(-1);
  expect(
    state.inbox.bookings.find((b: { id: string }) => b.id === a.crmBookingId)
      ?.time,
  ).toBe("10:00");
  await page.getByRole("button", { name: "新增預約", exact: true }).click();
  await d.getByLabel("預約客戶", { exact: true }).selectOption({ index: 1 });
  await d.getByLabel("預約日期及時間").fill("2026-12-01T10:05");
  await d.getByRole("button", { name: "建立預約", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("撞期");
  expect((await readState(page)).pos.appointments).toHaveLength(6);
});
test("POS company isolation and reload preserve transactions without sharing them", async ({
  page,
}) => {
  await start(page);
  await tab(page, "收銀台");
  await chooseCustomer(page);
  await page.locator(".sv-product-product").click();
  await cashPayment(page);
  const aurora = (await readState(page)).pos.payments.length;
  await page.getByLabel("切換示範公司").selectOption("preview-harbour");
  await expect(page.locator(".fh-workspace-name")).toContainText(
    "Harbour Living",
  );
  await tab(page, "交易記錄");
  await expect(page.locator(".sv-table tbody tr")).toHaveCount(1);
  await page.getByLabel("切換示範公司").selectOption("preview-aurora");
  await expect
    .poll(async () => (await readState(page)).pos.payments.length)
    .toBe(aurora);
});
test("POS overview, cashier and mobile layout are keyboard accessible with AA contrast", async ({
  page,
}, info) => {
  await start(page);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("smartvolt-pos-overview-desktop.png"),
    fullPage: true,
  });
  await tab(page, "收銀台");
  await chooseCustomer(page);
  await page.locator(".sv-product-service").first().click();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath("smartvolt-pos-cashier-mobile.png"),
    fullPage: true,
  });
  await tab(page, "今日營運");
  await page.screenshot({
    path: info.outputPath("smartvolt-pos-overview-mobile.png"),
    fullPage: true,
  });
});
