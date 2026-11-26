import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { AccessError } from "@/lib/saas/identity";
import { mfaContext, trustedSession } from "@/lib/saas/mfa-server";
import { MfaForm, type MfaView } from "./MfaForm";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "管理員雙重驗證 · Convelta",
  referrer: "no-referrer",
};
export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ mail?: string }>;
}) {
  let view: MfaView = "recovery",
    factors: { id: string; name: string }[] = [],
    authorized = false,
    unavailable = false;
  try {
    const c = await mfaContext();
    const verified =
      c.user.factors?.filter(
        (f) => f.factor_type === "totp" && f.status === "verified",
      ) ?? [];
    if (c.factor) {
      authorized =
        c.claims.aal === "aal2" &&
        (await trustedSession(c.user.id, c.claims.session_id));
      view = verified.some((f) => f.id === c.factor) ? "verify" : "recovery";
    } else if (c.proof && c.proof.stage !== "sent") {
      view = "setup";
      factors = verified.map((f, i) => ({
        id: f.id,
        name: f.friendly_name || `驗證器 ${i + 1}`,
      }));
    } else view = c.proof ? "sent" : "email";
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect("/login");
    if (error instanceof AccessError && error.status === 403) redirect("/");
    unavailable = true;
  }
  if (authorized) redirect("/");
  return (
    <main className="sv-picker">
      <section style={{ maxWidth: 480, margin: "0 auto" }}>
        <Link href="/" className="sv-brand">
          <BrandMark />
          <b>Convelta</b>
        </Link>
        <h1>管理員雙重驗證</h1>
        {(await searchParams).mail === "retry" && (
          <p role="alert">
            驗證連結已失效，或瀏覽器同原本登入時唔同。請喺原本嘅瀏覽器重新要求。
          </p>
        )}
        {unavailable ? (
          <p role="alert">暫時未能讀取驗證設定，請稍後再試或聯絡系統管理員。</p>
        ) : (
          <MfaForm view={view} factors={factors} />
        )}
        <form action="/auth/signout" method="post">
          <button className="sv-secondary">登出</button>
        </form>
      </section>
    </main>
  );
}
