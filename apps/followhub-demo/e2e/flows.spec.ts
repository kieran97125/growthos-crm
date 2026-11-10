import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const mobile of [false, true]) {
  test(`node deletion stays visible, confirms linked edges and preserves the last trigger (${mobile ? "mobile" : "desktop"})`, async ({
    page,
  }, info) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 600 });
    await page.goto("/?view=flows");
    await page.locator('.react-flow__node[data-id="remind"]').click();
    const remove = page.getByRole("button", { name: "刪除節點", exact: true });
    await expect(remove).toBeInViewport();
    await page.screenshot({
      path: info.outputPath(`node-delete-${mobile ? "mobile" : "desktop"}.png`),
    });
    await remove.click();
    const dialog = page.getByRole("dialog", {
      name: "刪除節點？",
      exact: true,
    });
    await expect(dialog).toContainText("範本預約提醒");
    await expect(dialog).toContainText("1 條相關連線");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(8);
    await remove.click();
    await dialog.getByRole("button", { name: "確認刪除", exact: true }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(7);
    await expect(page.locator(".react-flow__edge")).toHaveCount(6);
    await expect(
      page.locator('.react-flow__node[data-id="review"]'),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.locator('.react-flow__node[data-id="remind"]'),
    ).toHaveCount(0);
    await page.locator('.react-flow__node[data-id="start"]').click();
    await expect(remove).toBeVisible();
    await expect(remove).toBeDisabled();
    await expect(page.locator(".st-trigger-note")).toContainText(
      "起點不能刪除",
    );
  });
}

test("Flow uses actual graph, waits for review and validates reminder conditions", async ({
  page,
}, info) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(r.method()))
      writes.push(r.url());
  });
  await page.goto("/?view=flows");
  await expect(page.locator(".react-flow__node")).toHaveCount(8);
  await page.screenshot({ path: info.outputPath("flow-canvas-desktop.png") });
  await page.getByRole("button", { name: "試跑流程", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "開始試跑", exact: true }).click();
  await expect(dialog.locator(".st-trace")).toContainText("等候同事核實");
  await expect(dialog.locator(".st-trace")).not.toContainText(
    "06 · 範本預約提醒",
  );
  await dialog.getByLabel("假設同事已核實預約", { exact: true }).check();
  await dialog.getByLabel("仍在客服回覆窗口內", { exact: true }).uncheck();
  await dialog.getByRole("button", { name: "開始試跑", exact: true }).click();
  await expect(dialog.locator(".st-trace blockquote")).toContainText("陳曉晴");
  await expect(dialog.locator(".st-trace blockquote")).toContainText("HK$480");
  await expect(dialog.locator(".st-trace blockquote")).not.toContainText("{{");
  await dialog.getByLabel("假設客戶同意接收通知", { exact: true }).uncheck();
  await dialog.getByRole("button", { name: "開始試跑", exact: true }).click();
  await expect(dialog.locator(".st-trace")).toContainText("未有接收通知同意");
  await expect(dialog.locator(".st-trace blockquote")).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("canvas edits, positions and snapshots persist; restore uses the saved graph", async ({
  page,
}) => {
  await page.goto("/?view=flows");
  const node = page.locator('.react-flow__node[data-id="intent"]');
  await expect(node).toBeVisible();
  const before = await node.getAttribute("style");
  const box = await node.boundingBox();
  if (!box) throw new Error("Missing visible canvas node");
  await page.mouse.move(box.x + box.width / 2, box.y + 28);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + 50, { steps: 8 });
  await page.mouse.up();
  await expect(node).not.toHaveAttribute("style", before!);
  const movedTransform = await node.evaluate(
    (el) => getComputedStyle(el).transform,
  );
  await page.getByRole("button", { name: "關閉節點設定", exact: true }).click();
  await node.focus();
  await node.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "節點名稱", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "節點名稱", exact: true })
    .fill("辨識客戶需要・版本測試");
  await page
    .getByRole("combobox", { name: "下一步 預約意向", exact: true })
    .selectOption("human");
  await page
    .getByRole("combobox", { name: "下一步 真人協助", exact: true })
    .selectOption("intake");
  await page.getByRole("button", { name: "儲存版本", exact: true }).click();
  await page
    .getByRole("textbox", { name: "節點名稱", exact: true })
    .fill("後來改動");
  await page.getByRole("button", { name: "版本紀錄", exact: true }).click();
  await page.getByRole("button", { name: "還原", exact: true }).click();
  await expect(
    page.locator('.react-flow__node[data-id="intent"]'),
  ).toContainText("辨識客戶需要・版本測試");
  await page.getByRole("button", { name: "試跑流程", exact: true }).click();
  await page.getByRole("button", { name: "開始試跑", exact: true }).click();
  await expect(page.locator(".st-trace")).toContainText("交接畀 Iris");
  await expect(page.locator(".st-followup-preview")).toHaveCount(0);
  await page.getByRole("button", { name: "關閉視窗", exact: true }).click();
  await page.reload();
  await expect(
    page.locator('.react-flow__node[data-id="intent"]'),
  ).toContainText("辨識客戶需要・版本測試");
  await expect(page.locator('.react-flow__node[data-id="intent"]')).toHaveCSS(
    "transform",
    movedTransform,
  );
});

test("native form preview collects intent without claiming a confirmed appointment", async ({
  page,
}) => {
  await page.goto("/?view=flows");
  await page.getByRole("button", { name: "表單預覽", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("尚未發佈至 Meta");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "提交預約意向", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("等待同事核實後確認");
  await expect(page.getByRole("dialog")).not.toContainText("預約成功");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .include(".fh-dialog")
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
