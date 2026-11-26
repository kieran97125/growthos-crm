"use client";
import { useRef, useState } from "react";
import { chatPalettes, chatTheme } from "@/lib/web-chat/theme";
import useSWR from "swr";
import {
  BookOpen,
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
    [aiEnabled, setAiEnabled] = useState(
      initial.configs[0]?.aiEnabled ?? false,
    ),
    [aiArticleIds, setAiArticleIds] = useState<string[]>(
      initial.configs[0]?.aiArticleIds ?? [],
    ),
    [aiKnowledgeMode, setAiKnowledgeMode] = useState<
      "selected" | "brand_public"
    >(
      initial.configs[0]?.aiKnowledgeMode ??
        (initial.configs[0] ? "selected" : "brand_public"),
    ),
    [accentColor, setAccentColor] = useState(
      initial.configs[0]?.accentColor ?? "#2457E7",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [copied, setCopied] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const live = selected;
  const theme = chatTheme(accentColor);
  const articles = (data.publicArticles ?? []).filter(
    (a) => a.brandId === brandId,
  );
  const availableArticles = articles.filter((a) =>
    aiKnowledgeMode === "brand_public"
      ? a.autoPublic || aiArticleIds.includes(a.id)
      : aiArticleIds.includes(a.id),
  );
  const validColor = /^#[a-f0-9]{6}$/i.test(accentColor);
  const pending = useRef<{
    signature: string;
    body: string;
    action: "save" | "verify" | "activate";
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
    setAiEnabled(c?.aiEnabled ?? false);
    setAiArticleIds(c?.aiArticleIds ?? []);
    setAiKnowledgeMode(c?.aiKnowledgeMode ?? (c ? "selected" : "brand_public"));
    setAccentColor(c?.accentColor ?? "#2457E7");
    setError("");
    setNotice("");
  }
  async function submit(
    action: "save" | "verify" | "activate",
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
              aiEnabled,
              aiKnowledgeMode,
              ...(aiKnowledgeMode === "selected" ? { aiArticleIds } : {}),
              accentColor,
            }
          : action === "activate"
            ? { action, id: target, revision: live?.revision ?? 0 }
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
        action === "activate"
          ? "網站聊天已啟用，C 會按你嘅接待設定運作。"
          : action === "verify"
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
    ? `<meta name="convelta-chat-verification" content="${live.verification}">\n<script src="${appOrigin}/embed/chat.js?widget=${live.id}&amp;site=${encodeURIComponent(live.origins[0])}" data-convelta-chat="${live.id}" defer></script>`
    : "";
  const dirty =
    !!live &&
    (live.name !== name ||
      live.greeting !== greeting ||
      live.origins.join("\n") !== origins ||
      live.enabled !== enabled ||
      (live.aiEnabled ?? false) !== aiEnabled ||
      (live.aiKnowledgeMode ?? "selected") !== aiKnowledgeMode ||
      JSON.stringify(live.aiArticleIds ?? []) !==
        JSON.stringify(aiArticleIds) ||
      (live.accentColor ?? "#2457E7").toUpperCase() !==
        accentColor.toUpperCase());
  return (
    <main className="wc-settings">
      <header className="wc-settings-heading">
        <div>
          <span className="wc-eyebrow">C · WEBSITE ASSISTANT</span>
          <h1>為品牌設定 C</h1>
          <p>配合品牌外觀，同步品牌公開知識，將 C 接到你嘅網站。</p>
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
                <span>1</span>品牌與外觀
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
                  onChange={(e) => {
                    setBrandId(e.target.value);
                    setAiArticleIds([]);
                    setAiKnowledgeMode("brand_public");
                  }}
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
            <fieldset className="wc-palette" disabled={busy || uncertain}>
              <legend>品牌配色</legend>
              <div className="wc-swatches">
                {chatPalettes.map((p) => (
                  <button
                    key={p.color}
                    type="button"
                    title={p.name}
                    aria-label={`配色：${p.name}`}
                    aria-pressed={accentColor.toUpperCase() === p.color}
                    style={{
                      background: p.color,
                      color: chatTheme(p.color).onAccent,
                    }}
                    onClick={() => setAccentColor(p.color)}
                  >
                    {accentColor.toUpperCase() === p.color && (
                      <Check size={18} />
                    )}
                  </button>
                ))}
              </div>
              <div className="wc-custom-color">
                <input
                  type="color"
                  aria-label="自訂品牌顏色"
                  value={theme.accent}
                  onChange={(e) => setAccentColor(e.target.value.toUpperCase())}
                />
                <label>
                  自訂色碼
                  <input
                    aria-label="品牌色碼"
                    value={accentColor}
                    maxLength={7}
                    onChange={(e) => setAccentColor(e.target.value)}
                    spellCheck={false}
                  />
                </label>
              </div>
              <p className="wc-help">
                文字會自動配合深淺色，保持清晰易讀。
                {!validColor && " 請輸入 # 加六位色碼。"}
              </p>
            </fieldset>
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
                  !origins.trim() ||
                  !validColor ||
                  (aiEnabled && availableArticles.length === 0)
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
                <span>2</span>C 接待設定
              </h2>
              <MessageCircle size={20} />
            </div>
            <label className="wc-toggle">
              <input
                type="checkbox"
                checked={aiEnabled}
                disabled={busy || uncertain || data.canManageAI === false}
                onChange={(e) => setAiEnabled(e.target.checked)}
              />
              <span>
                <strong>C 自動介紹及回答問題</strong>
                <small>
                  真人接待期間仍可補答；客人要求只同真人傾時，C 會等候。
                </small>
              </span>
            </label>
            {data.canManageAI === false && (
              <p className="wc-help">
                公開知識及 AI 啟用由公司擁有人設定，你仍可調整品牌外觀。
              </p>
            )}
            <fieldset
              className="wc-knowledge"
              disabled={busy || uncertain || data.canManageAI === false}
            >
              <legend>品牌公開知識</legend>
              <div className="wc-knowledge-summary">
                <BookOpen size={22} aria-hidden="true" />
                <div>
                  <strong>{availableArticles.length} 篇可用知識</strong>
                  <p className="wc-help">
                    {aiKnowledgeMode === "brand_public"
                      ? "自動同步同品牌已批核嘅網站 FAQ 同公開知識，新增或修改後毋須再設定 C。"
                      : "目前沿用已指定嘅公開知識。改用自動同步後，新增及修改嘅公開 FAQ 亦會直接供 C 使用。"}
                  </p>
                </div>
              </div>
              {aiKnowledgeMode === "selected" && (
                <button
                  className="wc-secondary"
                  type="button"
                  onClick={() => setAiKnowledgeMode("brand_public")}
                >
                  改用自動同步公開知識
                </button>
              )}
              <p className="wc-help">
                內部、草稿、過期及其他品牌知識不會供訪客使用；資料不足會交同事跟進。
              </p>
              {!availableArticles.length && (
                <p className="wc-help">
                  請先喺品牌知識庫匯入網站 FAQ，或將資料設為可供網站 C
                  使用並批核。
                </p>
              )}
              {!!availableArticles.length && (
                <details className="wc-knowledge-list">
                  <summary>檢視可用知識</summary>
                  <ul>
                    {availableArticles.map((a) => (
                      <li key={a.id}>{a.title}</li>
                    ))}
                  </ul>
                </details>
              )}
            </fieldset>
            <p className="wc-help">
              <a href={`/company/${initial.companyId}/crm?view=bot`}>
                管理品牌知識庫 →
              </a>{" "}
              ·{" "}
              <a href={`/company/${initial.companyId}/crm/ai`}>
                公司 AI 設定 →
              </a>
            </p>
            <div className="wc-card-actions">
              <button
                className="wc-primary"
                disabled={
                  busy ||
                  uncertain ||
                  !brandId ||
                  !name.trim() ||
                  !greeting.trim() ||
                  !origins.trim() ||
                  !validColor ||
                  (aiEnabled && !availableArticles.length)
                }
                onClick={() => void submit("save")}
              >
                儲存接待設定
              </button>
            </div>
          </section>
          <section className="wc-card">
            <div className="wc-card-heading">
              <h2>
                <span>3</span>安裝並啟用
              </h2>
              <Code2 size={20} />
            </div>
            <p className="wc-help">
              複製以下完整代碼，貼到網站自訂代碼嘅 Head
              區域並發布。之後一按即可檢查網站並啟用，唔使逐項處理驗證。
            </p>
            <pre className="wc-install">{embed || "先儲存聊天窗設定"}</pre>
            <div className="wc-card-actions">
              <button
                className="wc-secondary"
                disabled={!embed}
                onClick={() => void copy(embed, "embed")}
              >
                <Copy size={14} />
                {copied === "embed" ? "已複製" : "複製安裝代碼"}
              </button>
              <button
                className="wc-primary"
                disabled={!live || dirty || busy || uncertain}
                onClick={() => void submit("activate")}
              >
                {busy ? "檢查中…" : "檢查安裝並啟用"}
              </button>
            </div>
            {live && (
              <p className="wc-help">
                {live.origins
                  .map(
                    (o) =>
                      `${new URL(o).hostname}：${live.verifiedOrigins.includes(o) ? "已驗證" : "待檢查"}`,
                  )
                  .join(" · ")}
              </p>
            )}
            <details className="wc-technical">
              <summary>手動驗證或 DNS 設定</summary>
              <div className="wc-card-heading">
                <ShieldCheck size={18} />
                <strong>手動驗證網站</strong>
              </div>
              {!live ? (
                <p className="wc-help">
                  先儲存上方設定，即可取得網站驗證資料。
                </p>
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
                            <code>
                              _convelta-chat.{new URL(origin).hostname}
                            </code>
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
              <p className="wc-help">
                如網站有 Content Security Policy，請允許 {appOrigin} 載入 script
                及 iframe。安裝代碼只需加入一次；之後外觀及接待知識喺呢度更新。
              </p>
            </details>
          </section>
        </div>
        <aside className="wc-preview-column">
          <div className="wc-preview-label">即時外觀預覽</div>
          <div
            className="wc-preview"
            style={
              {
                "--wc-accent": theme.accent,
                "--wc-on-accent": theme.onAccent,
                "--wc-tint": theme.tint,
              } as React.CSSProperties
            }
          >
            <header>
              <span className="wc-preview-icon">
                <MessageCircle size={22} />
              </span>
              <div>
                <strong>{name || "你嘅品牌"}</strong>
                <small>
                  {aiEnabled
                    ? "C · AI 助理與客服團隊"
                    : "留言後，同事會喺呢度回覆"}
                </small>
              </div>
            </header>
            <div className="wc-preview-body">
              <p>{greeting || "你好！有咩可以幫到你？"}</p>
              {aiEnabled && (
                <>
                  <div className="wc-preview-chips">
                    <span>了解功能</span>
                    <span>同真人傾</span>
                  </div>
                  <p className="wc-preview-visitor">想了解你哋嘅服務</p>
                  <p>
                    <small>C · AI 助理</small>
                    <br />
                    我可以幫你介紹服務，亦可以交畀同事繼續跟進。
                  </p>
                </>
              )}
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
