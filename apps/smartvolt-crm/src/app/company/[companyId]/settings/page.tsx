import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/saas/server";
import { AccessError, canManage } from "@/lib/saas/identity";
import { readChatReadiness } from "@/lib/web-chat/server";
export const dynamic = "force-dynamic";
export default async function CompanySettings({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let access;
  try {
    access = await requireCompany(companyId);
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect("/login");
    return (
      <main className="sv-picker">
        <h1>你無權進入公司設定</h1>
        <Link href="/">返回</Link>
      </main>
    );
  }
  const websiteReadiness = access.products.includes("crm") && canManage(access.actor.role)
    ? await readChatReadiness(companyId) : "unavailable";
  const { data: cards } = await access.db
    .from("sv_system_cards")
    .select("id,title,category,status,detail")
    .eq("company_id", companyId);
  const { data: members } = canManage(access.actor.role)
    ? await access.db
        .from("sv_memberships")
        .select("user_id,display_name,role,status")
        .eq("company_id", companyId)
    : { data: null };
  return (
    <main className="sv-picker">
      <Link href={`/company/${companyId}`}>← 返回客戶工作台</Link>
      <span className="sv-eyebrow">COMPANY SETTINGS</span>
      <h1>{access.company.name}</h1>
      <p>你目前嘅角色：{access.actor.role}。所有設定只適用於此公司。</p>
      <section className="sv-settings-section">
        <h2>公司產品方案</h2>
        <div className="sv-settings-plan">
          {access.products.map((p) => (
            <article key={p}>
              <strong>{p.toUpperCase()}</strong>
              <span>已購買 · 可使用</span>
            </article>
          ))}
        </div>
        <p>
          購買方案由 SaaS 營運方管理；員工角色只決定已購買產品內嘅操作權限。
        </p>
        {access.products.includes("pos") && (
          <Link className="sv-secondary" href={`/company/${companyId}/ledger`}>
            查閱交易帳簿 →
          </Link>
        )}
      </section>
      {access.products.includes("crm") && (
        <section className="sv-settings-section">
          <h2>通訊渠道設定</h2>
          {canManage(access.actor.role) && (
            <Link
              className="sv-secondary"
              href={`/company/${companyId}/settings/meta-feedback`}
            >
              Meta 成效回傳 →
            </Link>
          )}
          <p>
            日常覆客統一喺收件匣處理；喺呢度管理授權、接駁及個別渠道收發記錄。
          </p>
          <div className="sv-settings-plan">
            {canManage(access.actor.role) && (
              <>
                <Link
                  className="sv-secondary"
                  href={`/company/${companyId}/settings/social-comments`}
                >
                  IG／FB 留言轉私訊 →
                </Link>
                {websiteReadiness === "ready" ? (
                  <Link
                    className="sv-secondary"
                    href={`/company/${companyId}/settings/website-chat`}
                  >
                    官網聊天窗 →
                  </Link>
                ) : (
                  <button className="sv-secondary" disabled
                    title={websiteReadiness === "pending" ? "網站聊天準備中" : "網站聊天暫時未能使用"}>
                    官網聊天窗 · {websiteReadiness === "pending" ? "準備中" : "暫未開放"}
                  </button>
                )}
              </>
            )}
            <Link
              className="sv-secondary"
              href={`/company/${companyId}/crm/meta`}
            >
              Messenger／Instagram 接駁與記錄 →
            </Link>
            <Link
              className="sv-secondary"
              href={`/company/${companyId}/crm/whatsapp`}
            >
              WhatsApp 接駁與記錄 →
            </Link>
            <Link
              className="sv-secondary"
              href={`/company/${companyId}/settings/whatsapp`}
            >
              管理 WhatsApp 接駁 →
            </Link>
          </div>
        </section>
      )}
      {members && (
        <section className="sv-settings-section">
          <h2>團隊權限</h2>
          {access.products.includes("crm") &&
            access.memberScope.brandIds === null && (
              <Link
                className="sv-secondary"
                href={`/company/${companyId}/settings/routing`}
              >
                分店、專長與值班設定 →
              </Link>
            )}
          <p>邀請同事加入，管理角色、品牌及產品權限。</p>
          <Link
            className="sv-secondary"
            href={`/company/${companyId}/settings/team`}
          >
            管理同事與權限 →
          </Link>
        </section>
      )}
      <details className="sv-settings-section">
        <summary>
          系統工作卡（
          {cards?.filter((c) => c.status !== "complete").length ?? 0} 項待跟進）
        </summary>
        <p>尚未啟用嘅功能會列喺呢度，避免將示範狀態當作已接通。</p>
        <div className="sv-system-cards">
          {cards?.map((c) => (
            <article key={c.id}>
              <span>
                {c.category} · {c.status}
              </span>
              <h3>{c.title}</h3>
              <p>{c.detail}</p>
            </article>
          ))}
        </div>
      </details>
    </main>
  );
}

