import { expect, test, type Browser, type Page } from "@playwright/test";
import { mfaProvider } from "./mfa-provider";

let fixture: ReturnType<typeof mfaProvider>;
test.beforeEach(async () => {
  fixture = mfaProvider();
  await new Promise<void>((resolve, reject) =>
    fixture.server.on("error", reject).listen(3143, "127.0.0.1", resolve),
  );
});
test.afterEach(async () => {
  await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
});

async function login(page: Page, requireFactor = true) {
  await page.goto("/login");
  await page.getByLabel("工作電郵").fill(fixture.email);
  await page.getByLabel("密碼").fill(fixture.password);
  await page.getByRole("button", { name: "登入公司工作空間" }).click();
  if (requireFactor) await expect(page).toHaveURL(/\/auth\/mfa$/);
}
async function enroll(page: Page, workspace: string, whileEnrolling: number) {
  await page.getByRole("button", { name: "傳送驗證電郵" }).click();
  await expect(page.getByLabel("電郵驗證碼")).toBeVisible();
  const mailbox = fixture.status().mailCode;
  expect(mailbox).toMatch(/^\d{6}$/);
  await page.getByLabel("電郵驗證碼").fill(mailbox);
  await page.getByRole("button", { name: "確認電郵驗證碼" }).click();
  await page.getByRole("button", { name: "設定新驗證器" }).click();
  expect(fixture.status().mailRevoked).toBe(1);
  await expect(
    page.getByText("喺同一部手機設定？顯示手動輸入金鑰"),
  ).toBeVisible();
  expect((await page.request.get(workspace)).status()).toBe(whileEnrolling);
  await page.getByLabel("驗證器嘅 6 位數字").fill(fixture.authenticatorCode);
  await page.getByRole("button", { name: "確認並綁定驗證器" }).click();
  await expect(
    page.getByRole("heading", { name: "你嘅公司工作空間" }),
  ).toBeVisible();
  const response = await page.request.get(workspace);
  expect(response.status()).toBe(200);
  expect((await response.json()).state.scope.companyId).toBe(fixture.company);
  expect(fixture.status().bound).toBe(true);
}
async function confirmBoundFactor(browser: Browser, workspace: string) {
  const fresh = await browser.newContext({ baseURL: "http://127.0.0.1:3142" });
  try {
    const nextLogin = await fresh.newPage();
    await login(nextLogin);
    expect((await nextLogin.request.get(workspace)).status()).toBe(428);
    await expect(
      nextLogin.getByRole("button", { name: "傳送驗證電郵" }),
    ).toHaveCount(0);
    await nextLogin
      .getByLabel("驗證器嘅 6 位數字")
      .fill(fixture.authenticatorCode);
    await nextLogin.getByRole("button", { name: "驗證並繼續" }).click();
    await expect(
      nextLogin.getByRole("heading", { name: "你嘅公司工作空間" }),
    ).toBeVisible();
    expect((await nextLogin.request.get(workspace)).status()).toBe(200);
  } finally {
    await fresh.close();
  }
}

test("first admin needs mailbox and authenticator; a new password session still needs the bound factor", async ({
  page,
  browser,
}) => {
  const workspace = `/api/companies/${fixture.company}/workspace`;
  await login(page);
  expect((await page.request.get(workspace)).status()).toBe(428);
  expect(fixture.status().workspaceReads).toBe(0);
  await expect(page.getByRole("button", { name: "設定新驗證器" })).toHaveCount(
    0,
  );
  await enroll(page, workspace, 428);
  await confirmBoundFactor(browser, workspace);
});

test("designated existing owner retains access until voluntary pairing, which retires that exception", async ({
  page,
  browser,
}) => {
  fixture.designatePendingOwner();
  const workspace = `/api/companies/${fixture.company}/workspace`;
  await login(page, false);
  await expect(
    page.getByRole("heading", { name: "你嘅公司工作空間" }),
  ).toBeVisible();
  const invitation = page.getByRole("link", { name: "為帳戶設定雙重驗證" });
  await expect(invitation).toBeVisible();
  const response = await page.request.get(workspace);
  expect(response.status()).toBe(200);
  expect((await response.json()).state.scope.companyId).toBe(fixture.company);
  await invitation.click();
  await enroll(page, workspace, 200);
  await expect(invitation).toHaveCount(0);
  await confirmBoundFactor(browser, workspace);
});
test("first-time administrator can confirm their emailed PKCE link in the original browser", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "傳送驗證電郵" }).click();
  await expect(page.getByLabel("電郵驗證碼")).toBeVisible();
  const { mailLinkCode } = fixture.status();
  expect(mailLinkCode).toBeTruthy();
  await page.goto("/auth/mfa/confirm?code=" + mailLinkCode);
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:3142");
  await expect(
    page.getByRole("button", { name: "設定新驗證器" }),
  ).toBeVisible();
  expect(fixture.status().mailRevoked).toBe(1);
  expect(
    (
      await page.request.get(`/api/companies/${fixture.company}/workspace`)
    ).status(),
  ).toBe(428);
});
