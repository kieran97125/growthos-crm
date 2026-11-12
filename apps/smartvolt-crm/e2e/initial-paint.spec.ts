import { test, expect } from "@playwright/test";

// next dev injects styles with JavaScript. This regression must use next build
// + next start so it exercises production CSS discovery and first paint.
for (const [device, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  for (const product of ["crm", "pos"] as const) {
    test(`${product} ${device} stays styled on cold load and refresh with delayed stylesheets`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height });
      const selector = product === "crm" ? ".fh-app" : ".sv-pos";
      const expectedDisplay = product === "crm" ? "grid" : "flex";
      await page.addInitScript(
        ({ selector, expectedDisplay }) => {
          const state = { samples: 0, unstyled: [] as string[] };
          Object.assign(window, { __paintAudit: state });
          const sample = () => {
            const element = document.querySelector(selector);
            if (element && element.getBoundingClientRect().width > 0) {
              const style = getComputedStyle(element);
              state.samples++;
              if (
                style.display !== expectedDisplay &&
                state.unstyled.length < 20
              )
                state.unstyled.push(style.display);
            }
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        },
        { selector, expectedDisplay },
      );
      await page.route(/\/_next\/static\/.*\.css(?:\?|$)/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.continue();
      });
      for (const navigation of ["cold", "refresh"]) {
        if (navigation === "cold")
          await page.goto(`/preview/${product}?plan=both`);
        else await page.reload();
        await expect(page.locator(selector)).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(() => {
              return (
                window as unknown as { __paintAudit: { samples: number } }
              ).__paintAudit.samples;
            }),
          )
          .toBeGreaterThan(2);
        const audit = await page.evaluate(() => {
          return (
            window as unknown as {
              __paintAudit: { samples: number; unstyled: string[] };
            }
          ).__paintAudit;
        });
        expect(
          audit.unstyled,
          `${navigation} rendered an unstyled workspace`,
        ).toEqual([]);
        await expect(page.locator(selector)).toHaveCSS(
          "display",
          expectedDisplay,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`${product}-${device}-${navigation}.png`),
          fullPage: true,
        });
      }
    });
  }
}
