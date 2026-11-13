"use client";
import { useWorkspaceChrome } from "@/components/workspace/context";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Sparkles, ArrowUpRight, BookOpen } from "lucide-react";
import AIDraft from "./AIDraft";
export type AIStatus = {
  companyName: string;
  model: string | null;
  status: string;
  enabled: boolean;
  canGenerate: boolean;
  canConfigure: boolean;
  brands: { id: string; name: string; knowledgeCount: number }[];
  usage: { used: number; limit: number };
  knowledge: {
    id: string;
    brandId: string;
    title: string;
    status: string;
    revision: number;
    validUntil: string;
    source: string;
  }[];
  blocker: string | null;
  checkedAt: string | null;
};
export default function AIStudio({
  companyId,
  initialStatus,
}: {
  companyId: string;
  initialStatus: AIStatus;
}) {
  const chrome = useWorkspaceChrome();
  const [status, setStatus] = useState<AIStatus | null>(initialStatus),
    [error, setError] = useState(""),
    [brand, setBrand] = useState(initialStatus.brands[0]?.id ?? ""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false);
  const refresh = useCallback(async () => {
    const r = await fetch(
        `/api/ai/status?companyId=${encodeURIComponent(companyId)}`,
        { cache: "no-store" },
      ),
      data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "未能讀取 AI 狀態。");
    setStatus(data);
    setBrand((current) => current || data.brands[0]?.id || "");
  }, [companyId]);
  async function configure() {
    if (!status) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/ai/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, enabled: !status.enabled }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = status?.brands.find((b) => b.id === brand),
    knowledge = status?.knowledge.filter((a) => a.brandId === brand) ?? [];
  return (
    <main className="ai-studio">
      {!chrome && (
        <header className="ai-studio-header">
          <Link href={`/company/${companyId}/crm`} className="ai-brand">
            Convelta<span>{status?.companyName ?? "公司工作空間"}</span>
          </Link>
          <nav aria-label="AI 工作室導覽">
            <Link href={`/company/${companyId}/crm/meta`}>社交收件匣</Link>
            <Link href={`/company/${companyId}/crm?view=bot`}>管理知識</Link>
          </nav>
        </header>
      )}
      <div className="ai-studio-body">
        {chrome && (
          <nav className="cq-ai-links" aria-label="AI 工作室功能">
            <Link href={`/company/${companyId}/crm/ai`}>C 工作台</Link>
            <Link aria-current="page" href={`/company/${companyId}/crm/ai?mode=replies`}>回覆測試</Link>
            <Link href={`/company/${companyId}/crm?view=bot`}>
              BOT 與核准知識
            </Link>
          </nav>
        )}
        <div className="ai-hero">
          <div className="ai-eyebrow">
            <Sparkles size={15} aria-hidden="true" />
            CONVELTA INTELLIGENCE
          </div>
          <h1>
            更快掌握需要，
            <br />
            更有根據咁回覆。
          </h1>
          <p>將核准知識、客戶查詢同下一步連起。你掌握最後決定。</p>
        </div>
        {error && (
          <p role="alert" className="ai-message ai-error">
            {error}
          </p>
        )}
        <div className="ai-health">
          <span
            className={`ai-health-dot ${status?.status === "ready" ? "ready" : ""}`}
          />
          <div>
            <b>
              {status?.status === "ready"
                ? "真實模型已通過連線驗證"
                : (status?.blocker ?? "正在核對公司 AI…")}
            </b>
            <small>
              {status?.model ?? "未設定模型"}
              {status
                ? ` · 今日 ${status.usage.used} / ${status.usage.limit} 次`
                : ""}
            </small>
          </div>
          {status?.canConfigure && (
            <button disabled={busy} onClick={() => void configure()}>
              {status.enabled ? "暫停公司 AI" : "啟用公司 AI"}
            </button>
          )}
        </div>
        <div className="ai-studio-grid">
          <section className="ai-test-card">
            <div className="ai-card-heading">
              <h2>先試一段查詢</h2>
              <span>唔使等渠道審批</span>
            </div>
            <label>
              品牌
              <select
                disabled={locked}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              >
                {status?.brands.map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              客戶想問乜？
              <textarea
                rows={5}
                maxLength={2000}
                disabled={locked}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="例如：我哋有幾個同事覆 IG 同 Facebook，想集中管理查詢，有咩方案適合？"
              />
            </label>
            <p className="ai-input-hint">
              呢度係獨立測試查詢，唔會建立客戶記錄或發送訊息。
            </p>
            <AIDraft
              key={brand}
              context={{
                companyId,
                brandId: brand,
                source: "playground",
                message,
              }}
              disabled={
                !message.trim() ||
                !status?.enabled ||
                !status.canGenerate ||
                !status.model ||
                !selected?.knowledgeCount
              }
              onRequestState={setLocked}
              onGenerated={() =>
                void refresh().catch((e) => setError(e.message))
              }
            />
          </section>
          <aside className="ai-knowledge-card">
            <div className="ai-card-heading">
              <h2>
                <BookOpen size={17} aria-hidden="true" />
                答案由邊度嚟
              </h2>
              <span>{selected?.knowledgeCount ?? 0} 篇可用</span>
            </div>
            <p>只有屬於呢個品牌、已核准而且未到期嘅資料，先會交畀 AI 參考。</p>
            {knowledge.length ? (
              knowledge.map((a) => (
                <article key={a.id}>
                  <div>
                    <b>{a.title}</b>
                    <span>{a.status === "approved" ? "已核准" : "草稿"}</span>
                  </div>
                  <small>
                    v{a.revision} · 有效至 {a.validUntil}
                  </small>
                  <p>{a.source}</p>
                </article>
              ))
            ) : (
              <div className="ai-knowledge-empty">
                先加入公司服務、常見問題同處理原則，AI 先有根據準備答案。
              </div>
            )}
            <Link
              className="ai-knowledge-link"
              href={`/company/${companyId}/crm?view=bot`}
            >
              管理品牌知識
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <div className="ai-human-note">
              <b>有需要，交畀真人。</b>
              <p>
                資料不足、涉及未確認價格或預約時段，AI 會提示核實。AI
                建議唔代表已預約或已覆客。
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
