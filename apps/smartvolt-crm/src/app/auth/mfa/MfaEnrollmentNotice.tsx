import Link from "next/link";
import { ShieldCheck } from "lucide-react";
export function MfaEnrollmentNotice() {
  return (
    <aside className="sv-enrollment-notice" aria-label="帳戶安全設定">
      <ShieldCheck aria-hidden="true" size={20} />
      <span>你嘅管理員帳戶仍未綁定驗證器。</span>
      <Link href="/auth/mfa" prefetch={false}>
        為帳戶設定雙重驗證
      </Link>
    </aside>
  );
}
