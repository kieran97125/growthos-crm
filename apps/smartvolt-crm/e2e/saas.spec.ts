import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("login is branded, accessible and never fabricates a working account", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "歡迎返嚟" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "登入公司工作空間" }),
  ).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("尚未啟用");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("smartvolt-login-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath("smartvolt-login-mobile.png"),
    fullPage: true,
  });
});
test("preview companies keep separate local edits and restore the selected company's work", async ({
  page,
}) => {
  await page.goto("/preview?view=inbox");
  await expect(page.locator(".fh-workspace-name")).toContainText(
    "Aurora Wellness",
  );
  await page.getByRole("button", { name: "取消優先處理", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "標記優先處理", exact: true }),
  ).toBeVisible();
  await page.getByLabel("切換示範公司").selectOption("preview-harbour");
  await expect(page.locator(".fh-workspace-name")).toContainText(
    "Harbour Living",
  );
  await expect(
    page.getByRole("button", { name: "取消優先處理", exact: true }),
  ).toBeVisible();
  await page.getByLabel("切換示範公司").selectOption("preview-aurora");
  await expect(
    page.getByRole("button", { name: "標記優先處理", exact: true }),
  ).toBeVisible();
});
test("company APIs refuse cross-origin writes and do not expose demo-access auth", async ({
  request,
}) => {
  const response = await request.post(
    "/api/companies/11111111-1111-4111-8111-111111111111/workspace",
    { headers: { Origin: "https://foreign.example" }, data: {} },
  );
  expect(response.status()).toBe(403);
  expect((await request.post("/api/demo-access", { data: {} })).status()).toBe(
    404,
  );
  const read = await request.get(
    "/api/companies/11111111-1111-4111-8111-111111111111/workspace",
  );
  expect(read.status()).toBe(503);
  expect(await read.text()).not.toContain("contacts");
});
