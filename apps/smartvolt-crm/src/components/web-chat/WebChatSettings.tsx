"use client";
import { useRef, useState } from "react";
import useSWR from "swr";
import {
  Check,
  Code2,
  Copy,
  Globe2,
  MessageCircle,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type {
  WebChatConfig,
  WebChatSettings as Settings,
} from "@/lib/web-chat/model";
import "./web-chat.css";
const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: "no-store" }),
    d = await r.json();
  if (!r.ok) throw new Error(d.error || "未能讀取設定。");
  return d as Settings;
};
export default function WebChatSettings({
  initial,
  appOrigin = "https://app.convelta.io",
}: {
  initial: Settings;
  appOrigin?: string;
}) {
  const url = `/api/companies/${initial.companyId}/web-chat`,
    {
      data = initial,
      mutate,
      error: readError,
    } = useSWR<Settings>(url, fetcher, { fallbackData: initial });
  const [selected, setSelected] = useState<WebChatConfig | null>(
      initial.configs[0] ?? null,
    ),
    [id, setId] = useState(initial.configs[0]?.id ?? ""),
    [brandId, setBrandId] = useState(
      initial.configs[0]?.brandId ?? initial.brands[0]?.id ?? "",
    ),
    [name, setName] = useState(
      initial.configs[0]?.name ?? initial.brands[0]?.name ?? "",
    ),
    [greeting, setGreeting] = useState(
      initial.configs[0]?.greeting ?? "你好！有咩可以幫到你？",
    ),
    [origins, setOrigins] = useState(
      initial.configs[0]?.origins.join("\n") ?? "",
    ),
    [enabled, setEnabled] = useState(initial.configs[0]?.enabled ?? false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [copied, setCopied] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const live = selected;
  const pending = useRef<{
    signature: string;
    body: string;
    action: "save" | "verify";
    origin?: string;
  } | null>(null);
  const [verificationMethod, setVerificationMethod] = useState<"html" | "dns">(
    "html",
  );
  function choose(c: WebChatConfig | null) {
    setSelected(c);
    setId(c?.id ?? crypto.randomUUID());
    setBrandId(c?.brandId ?? data.brands[0]?.id ?? "");
    setName(c?.name ?? data.brands[0]?.name ?? "");
    setGreeting(c?.greeting ?? "你好！有咩可以幫到你？");
    setOrigins(c?.origins.join("\n") ?? "");
    setEnabled(c?.enabled ?? false);
    setError("");
    setNotice("");
  }
  async function submit(
    action: "save" | "verify",
    origin?: string,
    reconcile = false,
  ) {
    if (busy || (uncertain && !reconcile)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const target = id || crypto.randomUUID();
      if (!id) setId(target);
      const payload =
        action === "save"
          ? {
              action,
              id: target,
              revision: live?.revision ?? 0,
              brandId,
              name,
              greeting,
              origins: origins
                .split(/\n/)
                .map((x) => x.trim())
                .filter(Boolean),
              enabled,
            }
          : {
              action,
              id: target,
              revision: live?.revision ?? 0,
              origin,
              method: verificationMethod,
            };
      const signature = JSON.stringify(payload);
      if (!reconcile && pending.current?.signature !== signature)
        pending.current = {
          signature,
          action,
          origin,
          body: JSON.stringify({ ...payload, commandId: crypto.randomUUID() }),
        };
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pending.current!.body,
      });
      const result = await response.json();
      if (!response.ok) {
        if ([400, 401, 403, 404, 409, 429].includes(response.status)) {
          pending.current = null;
          setUncertain(false);
          await mutate();
        }
        throw new Error(result.error || "未能儲存設定。");
      }
      pending.current = null;
      setUncertain(false);
      const fresh = await mutate();
      const saved = fresh?.configs.find((c) => c.id === target);
      if (saved) choose(saved);
      setNotice(
        action === "verify"
          ? "網站已驗證，可以啟用聊天窗。"
          : enabled
            ? "聊天窗已啟用。"
            : "設定已儲存。網站驗證後即可啟用。",
      );
    } catch (e) {
      if (pending.current) setUncertain(true);
      setError(
        e instanceof TypeError
          ? "連線中斷，上次設定結果未確認。"
          : e instanceof Error
            ? e.message
            : "未能儲存，請稍後再試。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string, kind: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setError("未能自動複製，請選取文字複製。");
    }
  }
  const embed = live
    ? `<script src="${appOrigin}/embed/chat.js" data-convelta-chat="${live.id}" defer></script>`
    : "";
  const dirty =
    !!live &&
    (live.name !== name ||
      live.greeting !== greeting ||
      live.origins.join("\n") !== origins ||
      live.enabled !== enabled);
  return (
    <main className="wc-settings">
      <header className="wc-settings-heading">
        <div>
          <span className="wc-eyebrow">WEBSITE CHAT</span>
          <h1>喺網站接住每個查詢</h1>
          <p>訪客直接留言，同事喺收件匣回覆。</p>
        </div>
        <div className={`wc-status ${live?.enabled ? "enabled" : ""}`}>
          <span />
          {live?.enabled ? "已啟用" : "未啟用"}
        </div>
      </header>
      <div className="wc-settings-grid">
        <div className="wc-settings-content">
          <section className="wc-card">
            <div className="wc-card-heading">
              <h2>
                <span>1</span>設定聊天窗
              </h2>
              <button
                className="wc-secondary"
                onClick={() => choose(null)}
                disabled={busy || uncertain}
              >
                <Plus size={15} />
                新增
              </button>
            </div>
            {data.configs.length > 0 && (
              <label>
                現有聊天窗
                <select
                  aria-label="選擇聊天窗"
                  disabled={busy || uncertain}
                  value={live?.id ?? ""}
                  onChange={(e) =>
                    choose(
                      data.configs.find((c) => c.id === e.target.value) ?? null,
                    )
                  }
                >
                  <option value="">新增聊天窗</option>
                  {data.configs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="wc-form-grid">
              <label>
                品牌
                <select
                  aria-label="聊天窗品牌"
                  value={brandId}
                  disabled={!!live || busy || uncertain}
                  onChange={(e) => setBrandId(e.target.value)}
                >
                  {data.brands.map((b) => (
                    <option value={b.id} key={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                顯示名稱
                <input
                  disabled={busy || uncertain}
                  aria-label="聊天窗顯示名稱"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  required
                />
              </label>
            </div>
            <label>
              第一句問候
              <textarea
                disabled={busy || uncertain}
                aria-label="聊天窗問候"
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                maxLength={240}
                rows={2}
              />
            </label>
            <label>
              使用呢個聊天窗嘅網站
              <textarea
                disabled={busy || uncertain}
                aria-label="聊天窗網站"
                placeholder={"https://www.yourbrand.com\nhttps://yourbrand.com"}
                value={origins}
                onChange={(e) => setOrigins(e.target.value)}
                rows={3}
              />
            </label>
            <p className="wc-help">
              每行一個完整 HTTPS 網址；www 同主網域分開填。
            </p>
            <label className="wc-toggle">
              <input
                type="checkbox"
                checked={enabled}
                disabled={!live || busy || uncertain}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>
                <strong>啟用網站聊天</strong>
                <small>只會喺已驗證嘅網站顯示</small>
              </span>
            </label>
            <div className="wc-card-actions">
              <button
                className="wc-primary"
                disabled={
                  busy ||
                  uncertain ||
                  !brandId ||
                  !name.trim() ||
                  !greeting.trim() ||
                  !origins.trim()
                }
                onClick={() => void submit("save")}
              >
                {busy ? "處理中…" : "儲存設定"}
              </button>
              {dirty && <span className="wc-help">有未儲存改動</span>}
            </div>
          </section>
          <section className="wc-card">
            <div className="wc-card-heading">
              <h2>
                <span>2</span>驗證網站
              </h2>
              <ShieldCheck size={20} />
            </div>
            {!live ? (
              <p className="wc-help">先儲存上方設定，即可取得網站驗證資料。</p>
            ) : (
              <>
                <label>
                  驗證方式
                  <select
                    aria-label="網站驗證方式"
                    disabled={busy || uncertain}
                    value={verificationMethod}
                    onChange={(e) =>
                      setVerificationMethod(e.target.value as "html" | "dns")
                    }
                  >
                    <option value="html">加入網站標記</option>
                    <option value="dns">DNS TXT 紀錄</option>
                  </select>
                </label>
                <p className="wc-help">
                  {verificationMethod === "html"
                    ? "將以下標記加入網站首頁嘅 <head>，發布網頁後再撳驗證。"
                    : "請網站管理員喺 DNS 加入以下 TXT 紀錄，再撳驗證。"}
                </p>
                {live.origins.map((origin) => (
                  <div className="wc-domain" key={origin}>
                    <div className="wc-domain-title">
                      <strong>{new URL(origin).hostname}</strong>
                      {live.verifiedOrigins.includes(origin) ? (
                        <span className="wc-verified">
                          <Check size={14} />
                          已驗證
                        </span>
                      ) : (
                        <button
                          className="wc-secondary"
                          disabled={busy || uncertain || dirty}
                          onClick={() => void submit("verify", origin)}
                        >
                          驗證網站
                        </button>
                      )}
                    </div>
                    {verificationMethod === "html" ? (
                      <>
                        <pre className="wc-install">{`<meta name="convelta-chat-verification" content="${live.verification}">`}</pre>
                        <button
                          className="wc-secondary"
                          onClick={() =>
                            void copy(
                              `<meta name="convelta-chat-verification" content="${live.verification}">`,
                              "proof",
                            )
                          }
                        >
                          <Copy size={14} />
                          複製網站標記
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="wc-code-row">
                          <span>名稱</span>
                          <code>_convelta-chat.{new URL(origin).hostname}</code>
                          <button
                            className="wc-icon"
                            aria-label={`複製 ${origin} 驗證名稱`}
                            onClick={() =>
                              void copy(
                                `_convelta-chat.${new URL(origin).hostname}`,
                                origin,
                              )
                            }
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                        <div className="wc-code-row">
                          <span>TXT 值</span>
                          <code>convelta-chat={live.verification}</code>
                          <button
                            className="wc-icon"
                            aria-label="複製驗證值"
                            onClick={() =>
                              void copy(
                                `convelta-chat=${live.verification}`,
                                "proof",
                              )
                            }
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </>
            )}
          </section>
          <section className="wc-card">
            <div className="wc-card-heading">
              <h2>
                <span>3</span>加入網站
              </h2>
              <Code2 size={20} />
            </div>
            <p className="wc-help">
              將以下代碼貼喺網站嘅 &lt;/body&gt; 前面，啟用後即可開始接待。
            </p>
            <pre className="wc-install">{embed || "先儲存聊天窗設定"}</pre>
            <button
              className="wc-secondary"
              disabled={!embed}
              onClick={() => void copy(embed, "embed")}
            >
              <Copy size={14} />
              {copied === "embed" ? "已複製" : "複製安裝代碼"}
            </button>
            <details className="wc-technical">
              <summary>交畀網站管理員嘅補充資料</summary>
              <p>
                如網站有 Content Security Policy，請允許 {appOrigin} 載入 script
                及 iframe。聊天窗只提供真人接待，不會自行啟用 AI 回覆。
              </p>
            </details>
          </section>
        </div>
        <aside className="wc-preview-column">
          <div className="wc-preview-label">即時外觀預覽</div>
          <div className="wc-preview">
            <header>
              <span className="wc-preview-icon">
                <MessageCircle size={22} />
              </span>
              <div>
                <strong>{name || "你嘅品牌"}</strong>
                <small>留言後，同事會喺呢度回覆</small>
              </div>
            </header>
            <div className="wc-preview-body">
              <p>{greeting || "你好！有咩可以幫到你？"}</p>
            </div>
            <footer>
              <span>輸入訊息…</span>
              <span>↗</span>
            </footer>
          </div>
          <a
            className="wc-settings-inbox"
            href={`/company/${initial.companyId}/crm?provider=website`}
          >
            <Globe2 size={16} />
            前往網站訊息收件匣 →
          </a>
        </aside>
      </div>
      {uncertain && (
        <div className="wc-card wc-uncertain" role="status">
          <p>上次設定結果未確認，請先核對同一操作。</p>
          <button
            className="wc-secondary"
            disabled={busy}
            onClick={() => {
              const p = pending.current;
              if (p) void submit(p.action, p.origin, true);
            }}
          >
            核對同一設定操作
          </button>
        </div>
      )}
      {(error || readError) && (
        <p role="alert" className="wc-feedback wc-error">
          {error || readError.message}
        </p>
      )}
      {notice && (
        <p role="status" className="wc-feedback wc-success">
          {notice}
        </p>
      )}
      {copied && copied !== "embed" && (
        <span role="status" className="wc-sr">
          已複製
        </span>
      )}
    </main>
  );
}
