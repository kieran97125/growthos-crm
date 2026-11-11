import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/saas/server";
import { PasswordForm } from "./PasswordForm";
export const dynamic = "force-dynamic";
export default async function PasswordPage() {
  try {
    await requireUser();
  } catch {
    redirect("/login");
  }
  return (
    <main className="sv-picker" style={{ maxWidth: 560 }}>
      <Link href="/">← 返回公司工作空間</Link>
      <span className="sv-eyebrow">SMARTVOLT ACCOUNT</span>
      <h1>設定帳戶密碼</h1>
      <p>登入連結只驗證你嘅身分；公司角色及產品權限由管理員設定。</p>
      <PasswordForm />
    </main>
  );
}
