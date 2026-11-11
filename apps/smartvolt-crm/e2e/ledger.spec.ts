import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import LedgerView, {
  type LedgerViewProps,
} from "../src/app/company/[companyId]/ledger/LedgerView";

// Presentation-only synthetic fixtures: these tests do not exercise hosted Auth,
// database credentials or transport. SQL/authorization has separate PGlite tests.
const row = {
  id: "paid",
  number: "SV-20261112-0001",
  brandId: "main",
  createdAt: Date.parse("2026-11-11T16:30:00Z"),
  totalCents: 123456,
  paidCents: 123456,
  refundedCents: 0,
  netCents: 123456,
  voided: false,
  revision: 7,
};
const props: LedgerViewProps = {
  companyId: "isolated-fixture",
  companyName: "Aurora Studio · 示範資料",
  nextCursor: "next-page-fixture",
  query: { from: "2026-11-01", to: "2026-11-12", brand: null, limit: 50 },
  page: {
    revision: 7,
    hasMore: true,
    totals: {
      orders: 4,
      orderedCents: 45678900,
      paidCents: 45600000,
      refundedCents: 120000,
      netCents: 45480000,
    },
    rows: [
      row,
      {
        ...row,
        id: "refund",
        number: "SV-" + "9".repeat(47),
        refundedCents: 12000,
        netCents: 111456,
      },
      {
        ...row,
        id: "partial",
        number: "SV-20261112-0003",
        paidCents: 23456,
        netCents: 23456,
      },
      {
        ...row,
        id: "zero",
        number: "SV-20261112-0004",
        totalCents: 0,
        paidCents: 0,
        netCents: 0,
      },
    ],
  },
};
const css =
  readFileSync("src/app/saas.css", "utf8") +
  readFileSync("src/app/company/[companyId]/ledger/ledger.css", "utf8");
function html(data: LedgerViewProps) {
  return `<!doctype html><html lang="zh-HK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SmartVolt transaction ledger visual acceptance</title><style>body{margin:0;background:#f4f7fc;font-family:Arial,"PingFang HK",sans-serif}*{box-sizing:border-box}${css}</style></head><body>${renderToStaticMarkup(createElement(LedgerView, data))}</body></html>`;
}

for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  test(`ledger ${name} displays accurate amounts, scoped dates, accessible controls and contained table`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await page.setContent(html(props));
    await expect(
      page.getByRole("heading", { name: "每筆交易，有數可循。" }),
    ).toBeVisible();
    await expect(page.getByLabel("訂單開始日期")).toHaveValue("2026-11-01");
    await expect(page.getByLabel("訂單結束日期")).toHaveValue("2026-11-12");
    await expect(
      page.getByRole("row", { name: /SV-20261112-0001/ }),
    ).toContainText("1,234.56");
    await expect(
      page.getByRole("row", { name: /SV-20261112-0004/ }),
    ).toContainText("零金額");
    await expect(page.getByText("有退款", { exact: true })).toBeVisible();
    await expect(page.getByText("部分付款", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "下一頁 →" })).toHaveAttribute(
      "href",
      /from=2026-11-01.*to=2026-11-12.*cursor=next-page-fixture/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (name === "mobile") {
      const table = page.getByRole("region", { name: "可橫向捲動嘅交易表" });
      await table.focus();
      await expect(table).toBeFocused();
      expect(
        await table.evaluate((el) => el.scrollWidth > el.clientWidth),
      ).toBe(true);
    }
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`smartvolt-ledger-${name}.png`),
      fullPage: true,
    });
  });
}
test("empty ledger discloses no transactions and omits pagination", async ({
  page,
}) => {
  await page.setContent(
    html({
      ...props,
      nextCursor: null,
      page: {
        revision: 0,
        hasMore: false,
        rows: [],
        totals: {
          orders: 0,
          orderedCents: 0,
          paidCents: 0,
          refundedCents: 0,
          netCents: 0,
        },
      },
    }),
  );
  await expect(
    page.getByRole("heading", { name: "呢段期間未有交易" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "下一頁 →" })).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
});
