import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.goto("/crm/demo");
  await expect(
    page.getByRole("textbox", { name: "回覆訊息", exact: true }),
  ).toBeVisible();
});

test("conversation-first desktop has four panes, sends demo replies and keeps notes private", async ({
  page,
}, info) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
      mutations.push(request.url());
  });
  await expect(page.locator(".fh-queues")).toBeVisible();
  await expect(page.locator(".fh-conversations")).toBeVisible();
  await expect(page.locator(".fh-chat")).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "客戶資料", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("conversation-desktop.png") });
  await page
    .getByRole("textbox", { name: "回覆訊息", exact: true })
    .fill("我幫你確認兩位同行嘅空檔。");
  await page.getByRole("button", { name: "傳送", exact: true }).click();
  await expect(
    page
      .getByRole("log")
      .getByText("我幫你確認兩位同行嘅空檔。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "內部備註", exact: true }).click();
  await page
    .getByRole("textbox", { name: "內部備註內容" })
    .fill("內部交接測試，只供同事跟進。");
  await page.getByRole("button", { name: "加入備註", exact: true }).click();
  await expect(
    page
      .locator(".fh-internal-note")
      .getByText("內部交接測試，只供同事跟進。", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".fh-row-preview").first()).toHaveText(
    "你：我幫你確認兩位同行嘅空檔。",
  );
  await page.reload();
  await expect(
    page
      .getByRole("log")
      .getByText("我幫你確認兩位同行嘅空檔。", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".fh-internal-note")
      .getByText("內部交接測試，只供同事跟進。", { exact: true }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
});

test("drafts stay with each contact and quick replies use the current identity", async ({
  page,
}) => {
  await page
    .getByRole("textbox", { name: "回覆訊息", exact: true })
    .fill("曉晴專用草稿");
  await page
    .getByRole("button", { name: "開啟 Rachel Wong 對話", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "回覆訊息", exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("textbox", { name: "回覆訊息", exact: true })
    .fill("Rachel 專用草稿");
  await page
    .getByRole("button", { name: "開啟 陳曉晴 對話", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "回覆訊息", exact: true }),
  ).toHaveValue("曉晴專用草稿");
  await page.getByRole("button", { name: "快捷回覆", exact: true }).click();
  await page
    .locator(".fh-quick-picker")
    .getByRole("button", { name: /首次查詢/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "回覆訊息", exact: true }),
  ).toHaveValue(/你好 陳曉晴.*Nova Studio/);
  await page.getByRole("button", { name: /引用訊息：想問星期六/ }).click();
  await expect(page.locator(".fh-quote-preview")).toContainText("陳曉晴");
  await page.getByRole("button", { name: "傳送", exact: true }).click();
  await expect(page.locator(".fh-message-outgoing blockquote")).toContainText(
    "星期六",
  );
});

test("read queue does not cascade, assignment and resolve/reopen remain usable", async ({
  page,
}) => {
  await page.getByRole("button", { name: /^未讀訊息/ }).click();
  await expect(page.locator(".fh-conversation-row")).toHaveCount(3);
  await page
    .getByRole("button", { name: "開啟 陳曉晴 對話", exact: true })
    .click();
  await expect(page.locator(".fh-conversation-row")).toHaveCount(2);
  await expect(page.locator(".fh-chat h2")).toContainText("陳曉晴");
  await page.getByRole("combobox", { name: "分配負責人" }).selectOption("me");
  await expect(page.getByRole("combobox", { name: "分配負責人" })).toHaveValue(
    "me",
  );
  await page.getByRole("button", { name: "結束對話", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "重新開啟對話", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重新開啟對話", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "回覆訊息", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "稍後跟進", exact: true }).click();
  await page.getByRole("button", { name: "1 小時後", exact: true }).click();
  await expect(page.locator(".fh-conversation-context")).toContainText(
    "稍後跟進",
  );
  await page.getByRole("button", { name: "模擬客戶來訊", exact: true }).click();
  await expect(page.locator(".fh-conversation-context")).toContainText(
    "處理中",
  );
});

test("customer tags, editing and separate booking confirmations persist", async ({
  page,
}) => {
  await page.getByRole("button", { name: "管理客戶標籤", exact: true }).click();
  await page.getByRole("textbox", { name: "新標籤名稱" }).fill("下星期跟進");
  await page.getByRole("button", { name: "新增", exact: true }).click();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.locator(".fh-profile .fh-tags")).toContainText(
    "下星期跟進",
  );
  await page.getByRole("button", { name: "編輯資料", exact: true }).click();
  await page
    .getByRole("textbox", { name: "客戶備忘", exact: true })
    .fill("下次偏好窗邊位置");
  await page.getByRole("button", { name: "儲存資料", exact: true }).click();
  await expect(page.locator(".fh-customer-note")).toHaveText(
    "下次偏好窗邊位置",
  );
  await page.getByRole("button", { name: "管理預約", exact: true }).click();
  await page.getByRole("checkbox", { name: "客戶已表示接受此安排" }).check();
  await page.getByRole("button", { name: "儲存預約", exact: true }).click();
  await expect(page.locator(".fh-booking-state")).toHaveText("等候同事確認");
  await page.reload();
  await expect(page.locator(".fh-profile .fh-tags")).toContainText(
    "下星期跟進",
  );
  await expect(page.locator(".fh-customer-note")).toHaveText(
    "下次偏好窗邊位置",
  );
});

test("brand, search and channel intersect and directory opens the chosen customer", async ({
  page,
}) => {
  await page
    .getByRole("combobox", { name: "選擇品牌" })
    .selectOption("nova-care");
  await page.getByRole("searchbox", { name: "搜尋對話" }).fill("同事");
  await page
    .getByRole("combobox", { name: "對話渠道篩選" })
    .selectOption("messenger");
  await expect(page.locator(".fh-conversation-row")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "開啟 Jason Lee 對話", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "客戶通訊錄", exact: true }).click();
  await page.getByRole("textbox", { name: "搜尋客戶通訊錄" }).fill("Sophie");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Sophie Lau/ })
    .click();
  await expect(page.locator(".fh-chat h2")).toContainText("Sophie Lau");
  await expect(
    page.getByRole("button", { name: "重新開啟對話", exact: true }),
  ).toBeVisible();
});

test("mobile list, chat and customer sheet are usable without horizontal overflow", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".fh-conversations")).toBeVisible();
  await expect(page.locator(".fh-chat")).toBeHidden();
  await page
    .getByRole("button", { name: "開啟 陳曉晴 對話", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "回覆訊息", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("conversation-mobile.png") });
  await page.getByRole("button", { name: "查看客戶資料", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "分配負責人" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "收起客戶資料", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "返回對話列表", exact: true }).click();
  await expect(page.locator(".fh-conversations")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("workspace and native dialogs meet WCAG AA and keyboard Escape closes safely", async ({
  page,
}) => {
  const workspace = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(workspace.violations).toEqual([]);
  await page.getByRole("button", { name: "管理預約", exact: true }).click();
  const dialog = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(dialog.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
