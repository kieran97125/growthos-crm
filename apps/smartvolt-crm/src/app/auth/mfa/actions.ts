"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import {
  authenticationMethods,
  clearMailboxProof,
  mfaContext,
  trustedSession,
  verifiedSession,
  writeMailboxProof,
} from "@/lib/saas/mfa-server";
import { mailboxLifetime } from "@/lib/saas/mfa-proof";
import { confirmMailbox, mailboxClient } from "@/lib/saas/mfa-mail";
import type { MfaResult } from "./types";

export async function beginMailboxProof(): Promise<MfaResult> {
  try {
    const c = await mfaContext();
    if (c.factor || !authenticationMethods(c.claims.amr).includes("password"))
      return { error: "請先登出，再用公司電郵同密碼登入。" };
    const origin = new URL(process.env.SMARTVOLT_APP_URL || BRAND.urls.app);
    if (origin.protocol !== "https:" || origin.username || origin.password)
      return { error: "驗證電郵未完成設定，請聯絡系統管理員。" };
    const mail = mailboxClient();
    const { error } = await mail.client.auth.signInWithOtp({
      email: c.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: new URL("/auth/mfa/confirm", origin).href,
      },
    });
    const verifier = mail.verifier();
    if (error || !verifier)
      return { error: "暫時未能寄出驗證電郵，請稍後再試或聯絡系統管理員。" };
    await writeMailboxProof({
      ...c.identity,
      stage: "sent",
      verifier,
      expires: Date.now() + mailboxLifetime * 1000,
    });
    return { sent: true };
  } catch {
    return { error: "暫時未能寄出驗證電郵，請重新登入再試。" };
  }
}
export async function confirmEmailCode(
  _state: MfaResult,
  form: FormData,
): Promise<MfaResult> {
  const otp = form.get("code");
  if (typeof otp !== "string" || !/^\d{6,10}$/.test(otp))
    return { error: "請輸入電郵內嘅驗證碼。" };
  try {
    await confirmMailbox({ otp });
  } catch {
    return { error: "電郵驗證未能完成，請核對驗證碼或重新要求。" };
  }
  redirect("/auth/mfa");
}
export async function startEnrollment(): Promise<MfaResult> {
  try {
    const c = await mfaContext();
    if (c.factor || !c.proof || c.proof.stage === "sent")
      return { error: "請先完成電郵驗證。" };
    // Only discard the incomplete factor from this very browser's previous setup; never remove a verified factor here.
    if (c.proof.stage === "enrolling") {
      const pendingId = c.proof.factor;
      const previous = c.user.factors?.find(
        (factor) => factor.id === pendingId,
      );
      if (previous?.status === "unverified")
        await c.client.auth.mfa.unenroll({ factorId: previous.id });
    }
    const { data, error } = await c.client.auth.mfa.enroll({
      factorType: "totp",
      issuer: BRAND.name,
      friendlyName: `Convelta ${randomUUID().slice(0, 8)}`,
    });
    if (error || !data)
      return {
        error:
          "未能新增驗證器。如果帳戶已有驗證器，可選擇並核實你持有嗰個；如無法使用，請聯絡系統管理員核實身份。",
      };
    await writeMailboxProof({
      ...c.identity,
      stage: "enrolling",
      factor: data.id,
      expires: c.proof.expires,
    });
    return { factor: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  } catch {
    return { error: "暫時未能設定驗證器，請重新登入再試。" };
  }
}
export async function verifyAuthenticator(
  _state: MfaResult,
  form: FormData,
): Promise<MfaResult> {
  const code = form.get("code");
  if (typeof code !== "string" || !/^\d{6}$/.test(code))
    return { error: "請輸入驗證器顯示嘅六位數字。" };
  try {
    const c = await mfaContext();
    let factor = c.factor;
    if (!factor) {
      const chosen = form.get("factor");
      if (typeof chosen !== "string" || !c.proof || c.proof.stage === "sent")
        return { error: "請先完成電郵驗證。" };
      const nativeFactor = c.user.factors?.find(
        (f) => f.id === chosen && f.factor_type === "totp",
      );
      const startedHere =
        c.proof.stage === "enrolling" && c.proof.factor === chosen;
      if (!startedHere && nativeFactor?.status !== "verified")
        return { error: "請選擇你已設定嘅驗證器。" };
      factor = chosen;
    }
    const verified = await c.client.auth.mfa.challengeAndVerify({
      factorId: factor,
      code,
    });
    if (verified.error)
      return { error: "驗證未成功，請核對驗證碼或稍後再試。" };
    const claims = await verifiedSession(c.client, c.user.id);
    if (claims.aal !== "aal2")
      return { error: "未能確認登入強度，請重新登入。" };
    if (!c.factor) {
      // A concurrent request may bind the same factor. A different existing binding always wins.
      const saved = await c.db
        .from("sv_trusted_mfa_factors")
        .upsert(
          { user_id: c.user.id, factor_id: factor },
          { onConflict: "user_id", ignoreDuplicates: true },
        );
      if (saved.error) return { error: "未能儲存驗證器，請聯絡系統管理員。" };
    }
    if (!(await trustedSession(c.user.id, claims.session_id)))
      return { error: "未能確認已綁定嘅驗證器，請聯絡系統管理員。" };
    await clearMailboxProof();
  } catch {
    return { error: "暫時未能完成雙重驗證，請稍後再試。" };
  }
  redirect("/");
}
