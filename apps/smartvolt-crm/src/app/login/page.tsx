import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { saasConfig } from "@/lib/saas/config";
import { LoginForm } from "./LoginForm";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string; password?: string }>;
}) {
  const query = await searchParams;
  return (
    <main className="sv-auth">
      <section className="sv-auth-story">
        <Link className="sv-brand" href="/">
          <BrandMark />
          <b>
            SmartVolt<span>CRM</span>
          </b>
        </Link>
        <div className="sv-auth-copy">
          <span className="sv-eyebrow">CUSTOMER CONVERSATIONS, CONNECTED.</span>
          <h1>
            每段對話，
            <br />
            都有下一步。
          </h1>
          <p>
            訊息、客戶關係、AI 助手同團隊跟進，
            <br />
            全部喺你公司嘅專屬工作空間。
          </p>
          <div className="sv-conversation-card">
            <div>
              <span className="sv-avatar">J</span>
              <b>客戶查詢</b>
              <small>WhatsApp</small>
            </div>
            <p>想了解一下服務，可以幫我安排時間嗎？</p>
            <div className="sv-reply">
              收到！我會幫你整理需求，再由同事確認安排。
            </div>
            <footer>
              <span>AI 準備建議</span>
              <span>同事核實</span>
              <span>持續跟進</span>
            </footer>
          </div>
        </div>
        <small className="sv-auth-foot">SmartVolt · 智威特</small>
      </section>
      <section className="sv-auth-panel">
        <div>
          <span className="sv-eyebrow">YOUR COMPANY WORKSPACE</span>
          <h2>歡迎返嚟</h2>
          <p>登入，繼續你同客戶嘅對話。</p>
          {query.confirmation === "invalid" && (
            <p role="alert">登入連結無效或已過期，請聯絡管理員。</p>
          )}
          {query.password === "updated" && (
            <p role="status">密碼已更新，請用新密碼登入。</p>
          )}
          <LoginForm enabled={Boolean(saasConfig())} />
          <Link className="sv-preview-link" href="/preview">
            體驗示範工作空間 <span>↗</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
