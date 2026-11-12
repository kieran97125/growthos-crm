import Link from "next/link";
import { randomUUID } from "node:crypto";
import { MemberControls } from "./MemberControls";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/saas/server";
import { AccessError, canManage } from "@/lib/saas/identity";
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
  const { data: workspace } =
    access.actor.role === "owner"
      ? await access.db
          .from("sv_workspaces")
          .select("revision")
          .eq("company_id", companyId)
          .single()
      : { data: null };
  return (
    <main className="sv-picker">
      <Link href={`/company/${companyId}`}>← 返回客戶工作台</Link>
      <span className="sv-eyebrow">COMPANY SETTINGS</span>
      <h1>{access.company.name}</h1>
      <p>你目前嘅角色：{access.actor.role}。所有設定只適用於此公司。</p>
      <Link href="/account/password">設定帳戶密碼</Link>
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
          <h2>WhatsApp 客戶服務</h2>
          <p>接收真實查詢、手動覆客，同追蹤 Meta 回傳嘅訊息狀態。</p>
          <div className="sv-settings-plan">
            <Link
              className="sv-secondary"
              href={`/company/${companyId}/crm/whatsapp`}
            >
              開啟 WhatsApp 收件匣 →
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
          <table>
            <thead>
              <tr>
                <th>同事</th>
                <th>角色</th>
                <th>狀態</th>
                <th>管理</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.display_name}</td>
                  <td>{m.role}</td>
                  <td>{m.status}</td>
                  <td>
                    {m.role === "owner" ? (
                      "擁有人保護"
                    ) : access.actor.role === "owner" &&
                      workspace &&
                      m.status !== "invited" ? (
                      <MemberControls
                        companyId={companyId}
                        revision={workspace.revision}
                        member={m}
                        commandId={randomUUID()}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="sv-settings-section">
        <h2>系統工作卡</h2>
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
      </section>
    </main>
  );
}
