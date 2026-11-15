import type { Page, Route } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { BRAND_CSS } from "../src/lib/brand";

export const syntheticCompany = "11111111-1111-4111-8111-111111111111";
export const syntheticCustomer = "22222222-2222-4222-8222-222222222222";
export const syntheticOtherCustomer = "33333333-3333-4333-8333-333333333333";
export const syntheticSource = "44444444-4444-4444-8444-444444444444";
export const syntheticOtherSource = "55555555-5555-4555-8555-555555555555";
export const syntheticId = "66666666-6666-4666-8666-666666666666";
export type RecordedCommand = { url: string; body: Record<string, unknown> };
export async function fixtureBundle(contents: string) {
  return (
    await build({
      stdin: { contents, loader: "tsx", resolveDir: process.cwd() },
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      loader: { ".css": "empty" },
      jsx: "automatic",
      define: { "process.env": JSON.stringify({ NODE_ENV: "test" }) },
    })
  ).outputFiles[0].text;
}
export async function mountFixture(
  page: Page,
  options: {
    name: string;
    bundle: string;
    styles: string[];
    handle: (
      route: Route,
      url: URL,
      body: Record<string, unknown> | null,
    ) => Promise<void>;
  },
) {
  const commands: RecordedCommand[] = [];
  await page.route(`**/__${options.name}_fixture__`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body></body></html>",
    }),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    let body: Record<string, unknown> | null = null;
    if (request.method() !== "GET") {
      body = request.postDataJSON() as Record<string, unknown>;
      commands.push({ url: request.url(), body });
    }
    await options.handle(route, new URL(request.url()), body);
  });
  await page.goto(`/__${options.name}_fixture__`);
  const vars = Object.entries(BRAND_CSS)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  const css = options.styles
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  await page.setContent(
    `<!doctype html><html lang="zh-HK"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic ${options.name} acceptance</title><style>:root{${vars}}*{box-sizing:border-box}body{margin:0;background:#f6f8ff;color:#13234a;font-family:Arial,'Noto Sans CJK TC',sans-serif}main{max-width:1100px;padding:16px;margin:auto}nav.fixture-nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}${css}</style></head><body><div id="fixture"></div></body></html>`,
  );
  await page.addScriptTag({ content: options.bundle });
  return commands;
}
