"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import type { MetaChannel } from "@/lib/meta/protocol";
type Connection = {
  id: string;
  brand_id: string;
  channel: MetaChannel;
  label: string;
  enabled: boolean;
  page_id: string;
  account_id: string;
  last_inbound_at: number | null;
};
type Thread = {
  unread_count?: number;
  id: string;
  connection_id: string;
  peer_id: string;
  revision: number;
  last_inbound_at: number | null;
  status: string;
};
type Message = {
  id: string;
  seq: number;
  direction: string;
  body: string;
  state: string;
  provider_id: string | null;
  provider_at: number | null;
  created_at: string;
  error_code: string | null;
  referral: Record<string, unknown> | null;
};
type Overview = {
  companyName: string;
  canSend: boolean;
  canManage: boolean;
  brands: { id: string; name: string }[];
  connections: Connection[];
  threads: Thread[];
  nextCursor: string | null;
  readiness: {
    ready: boolean;
    blockers: string[];
    webhookUrl: string | null;
    verifyToken: string | null;
  };
};
type Detail = {
  sources?: { at: number; adId: string | null }[];
  thread: Thread;
  messages: Message[];
  hasMore: boolean;
};
const labels: Record<string, string> = {
  received: "已收取",
  sending: "發送中・待確認",
  accepted: "平台已接受",
  sent: "已傳送",
  delivered: "已送達",
  read: "已讀",
  failed: "未能發送",
  uncertain: "結果待核對",
  note: "內部備註",
};
const date = (value: number | string) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
export default function MetaInbox({ companyId }: { companyId: string }) {
  const endpoint = `/api/companies/${encodeURIComponent(companyId)}/meta`;
  const [overview, setOverview] = useState<Overview | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState(""),
    [note, setNote] = useState(false),
    [pendingThread, setPendingThread] = useState<string | null>(null),
    [channel, setChannel] = useState("all"),
    [now, setNow] = useState(0);
  const selection = useRef<string | null>(null),
    pending = useRef<{
      clientId: string;
      threadId: string;
      body: string;
      revision: number;
    } | null>(null),
    drafts = useRef<Record<string, string>>({});
  const request = useCallback(
    async <T,>(
      query = "",
      data?: unknown,
      signal?: AbortSignal,
    ): Promise<T> => {
      const res = await fetch(endpoint + query, {
        method: data ? "POST" : "GET",
        headers: data ? { "Content-Type": "application/json" } : undefined,
        body: data ? JSON.stringify(data) : undefined,
        cache: "no-store",
        signal,
      });
      const value = await res.json();
      if (!res.ok) throw new Error(value.error ?? "暫時未能讀取收件匣。");
      return value as T;
    },
    [endpoint],
  );
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const id = selection.current;
      const [o, d] = await Promise.all([
        request<Overview>("", undefined, signal),
        id
          ? request<Detail>(`?thread=${id}`, undefined, signal)
          : Promise.resolve(null),
      ]);
      setOverview((current) =>
        current && current.threads.length > 100
          ? {
              ...o,
              threads: [
                ...o.threads,
                ...current.threads.filter(
                  (t) => !o.threads.some((n) => n.id === t.id),
                ),
              ],
              nextCursor: current.nextCursor,
            }
          : o,
      );
      if (selection.current === id)
        setDetail((current) => {
          if (!current || !d || current.thread.id !== d.thread.id) return d;
          const retainedOlder =
            !!current.messages.length &&
            !!d.messages.length &&
            current.messages[0].seq < d.messages[0].seq;
          const merged = new Map(
            [...current.messages, ...d.messages].map((m) => [m.id, m]),
          );
          return {
            ...d,
            messages: [...merged.values()].sort((a, b) => a.seq - b.seq),
            hasMore: retainedOlder ? current.hasMore : d.hasMore,
          };
        });
      setNow(Date.now());
    },
    [request],
  );
  useEffect(() => {
    const controller = new AbortController();
    let active = true,
      working = false;
    const load = async () => {
      if (working) return;
      working = true;
      try {
        await refresh(controller.signal);
        if (active) setError("");
      } catch (e) {
        if (active && !controller.signal.aborted)
          setError(e instanceof Error ? e.message : "讀取失敗。");
      } finally {
        working = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      controller.abort();
    };
  }, [refresh]);
  async function selectThread(id: string) {
    if (busy) return;
    if (selection.current) drafts.current[selection.current] = draft;
    selection.current = id;
    setSelected(id);
    setDetail(null);
    setDraft(drafts.current[id] ?? "");
    setError("");
    setNotice("");
    try {
      const data = await request<Detail>(`?thread=${id}`);
      if (selection.current !== id) return;
      setDetail(data);
      if (overview?.canSend && data.messages.length)
        await request("", {
          action: "read",
          threadId: id,
          through: data.messages.at(-1)!.seq,
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "讀取失敗。");
    }
  }
  async function action(data: unknown, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request("", data);
      setNotice(success);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作未完成。");
    } finally {
      setBusy(false);
    }
  }
  async function send(reconcile = false) {
    if (!selected || !detail || busy) return;
    if (reconcile && pending.current?.threadId !== selected) return;
    const text = reconcile ? pending.current!.body : draft;
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (note && !reconcile) {
        await request("", { action: "note", threadId: selected, body: text });
        setNotice("內部備註已儲存，未向客戶發送。");
      } else {
        if (
          pending.current &&
          (pending.current.threadId !== selected ||
            pending.current.body !== text)
        )
          throw new Error("有一項發送結果待核對，請先重新讀取對話紀錄。");
        pending.current ??= {
          clientId: crypto.randomUUID(),
          threadId: selected,
          body: text,
          revision: detail.thread.revision,
        };
        setPendingThread(selected);
        const result = await request<{ state: string }>("", {
          action: "send",
          ...pending.current,
        });
        if (result.state === "failed") {
          pending.current = null;
          setPendingThread(null);
          setError("平台未接受呢則回覆，草稿已保留。請核對錯誤及接駁後再試。");
          await refresh();
          return;
        }
        if (!["accepted", "sent", "delivered", "read"].includes(result.state)) {
          setError(
            "發送結果待核對，草稿已保留。請核對原有發送，避免重複聯絡客戶。",
          );
          await refresh();
          return;
        }
        setNotice(labels[result.state] ?? "發送狀態待核對");
        pending.current = null;
        setPendingThread(null);
      }
      if (draft === text) {
        setDraft("");
        drafts.current[selected] = "";
      }
      await refresh();
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "發送結果未知。") +
          (pending.current ? " 請先重讀記錄，唔好重複發送。" : ""),
      );
      try {
        await refresh();
      } catch {
        /* Preserve the visible error and draft. */
      }
    } finally {
      setBusy(false);
    }
  }
  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await request("", {
        action: "connect",
        channel: data.get("channel"),
        brandId: data.get("brandId"),
        pageId: String(data.get("pageId") ?? "").trim(),
        token: String(data.get("token") ?? "").trim(),
        ...(data.get("id") ? { id: data.get("id") } : {}),
      });
      setNotice(
        "憑證已驗證及加密儲存，請完成 Meta Webhook 訂閱並用真實查詢驗收。",
      );
      form.reset();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "接駁未完成。");
    } finally {
      const token = form.elements.namedItem("token") as HTMLInputElement | null;
      if (token) token.value = "";
      setBusy(false);
    }
  }
  const connection = overview?.connections.find(
      (c) => c.id === detail?.thread.connection_id,
    ),
    windowOpen =
      !!detail?.thread.last_inbound_at &&
      now - detail.thread.last_inbound_at < 86400000 &&
      now >= detail.thread.last_inbound_at;
  const unresolved = detail?.messages.some(
      (m) => m.state === "sending" || m.state === "uncertain",
    ),
    max = note ? 2000 : connection?.channel === "instagram" ? 1000 : 2000;
  const threads =
    overview?.threads.filter(
      (t) =>
        channel === "all" ||
        overview.connections.find((c) => c.id === t.connection_id)?.channel ===
          channel,
    ) ?? [];
  return (
    <main className="meta-workspace">
      <header className="meta-header">
        <Link href={`/company/${companyId}`} className="meta-brand">
          {BRAND.name}
          <small>{overview?.companyName ?? "公司工作空間"}</small>
        </Link>
        <span>
          社交收件匣 <b>Messenger · Instagram</b>
        </span>
        <div>
          <Link href={`/company/${companyId}/settings`}>公司設定</Link>
          <button
            onClick={() => void refresh().catch((e) => setError(e.message))}
            disabled={busy}
          >
            重新讀取
          </button>
        </div>
      </header>
      {error && (
        <p className="meta-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="meta-notice" role="status">
          {notice}
        </p>
      )}
      {loading && !overview ? (
        <p className="meta-loading">正在讀取公司收件匣…</p>
      ) : (
        <>
          {overview?.canManage && (
            <details className="meta-setup" open={!overview.connections.length}>
              <summary>
                管理 Messenger／Instagram 接駁{" "}
                <span>
                  {overview.connections.length
                    ? `${overview.connections.length} 個連接`
                    : "尚未接駁"}
                </span>
              </summary>
              <div className="meta-setup-grid">
                <section>
                  <h2>連接公司專頁</h2>
                  <p>
                    使用 Convelta 專用 Meta App 嘅 Page Access
                    Token。系統會先核實專頁、App 及權限，再加密儲存。
                  </p>
                  {overview.readiness.blockers.length > 0 && (
                    <p className="meta-alert">
                      {overview.readiness.blockers.join("；")}
                    </p>
                  )}
                  <form onSubmit={connect}>
                    <label>
                      渠道
                      <select name="channel">
                        <option value="messenger">Facebook Messenger</option>
                        <option value="instagram">
                          Instagram（Facebook Login 接駁）
                        </option>
                      </select>
                    </label>
                    <label>
                      公司品牌
                      <select name="brandId">
                        {overview.brands.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Facebook Page ID
                      <input
                        name="pageId"
                        required
                        inputMode="numeric"
                        pattern="[1-9][0-9]{1,49}"
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      Page Access Token
                      <input
                        name="token"
                        type="password"
                        required
                        autoComplete="off"
                        minLength={20}
                        maxLength={8192}
                      />
                    </label>
                    <button
                      className="meta-primary"
                      disabled={busy || !overview.readiness.ready}
                    >
                      驗證並儲存接駁
                    </button>
                    {!overview.readiness.ready && (
                      <small>
                        先完成上面列出嘅營運方設定，先可以儲存憑證。
                      </small>
                    )}
                  </form>
                </section>
                <section>
                  <h2>Webhook 與正式啟用</h2>
                  <p>
                    喺 Meta App 設定 Callback URL 同 Verify
                    Token，再為公司專頁訂閱對應訊息事件。Instagram
                    需要已連結專頁嘅專業帳戶。
                  </p>
                  <label>
                    Callback URL
                    <input
                      readOnly
                      value={overview.readiness.webhookUrl ?? "尚未配置"}
                    />
                  </label>
                  {overview.readiness.verifyToken && (
                    <label>
                      Verify Token
                      <input
                        type="password"
                        readOnly
                        value={overview.readiness.verifyToken}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(overview.readiness.verifyToken!)
                            .then(
                              () => setNotice("Verify Token 已複製。"),
                              () => setError("請選取並複製 Verify Token。"),
                            )
                        }
                      >
                        複製 Verify Token
                      </button>
                    </label>
                  )}
                  <ol>
                    <li>完成 Meta App 發佈及所需訊息權限。</li>
                    <li>
                      設定並驗證 Webhook，訂閱訊息、回聲、回執及推薦來源。
                    </li>
                    <li>接收一則真實查詢，再於此收件匣手動回覆。</li>
                    <li>核對平台訊息 ID 及可用嘅送達回執。</li>
                  </ol>
                  <small>
                    只儲存憑證唔代表已收發成功。未設定廣播或自動 AI 回覆。
                  </small>
                </section>
              </div>
            </details>
          )}
          {!!overview?.connections.length && (
            <div className="meta-connections">
              {overview.connections.map((c) => (
                <div key={c.id}>
                  <span
                    className={`meta-indicator ${c.enabled && c.last_inbound_at ? "active" : ""}`}
                  />
                  <b>{c.label}</b>
                  <span>
                    {c.channel === "messenger" ? "Messenger" : "Instagram"} ·{" "}
                    {!c.enabled
                      ? "已停用"
                      : c.last_inbound_at
                        ? "已收到訊息"
                        : "已配置・待真實收訊"}
                  </span>
                  {overview.canManage && c.enabled && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(
                          { action: "disable", connectionId: c.id },
                          "此連接已停用。",
                        )
                      }
                    >
                      停用
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="meta-columns">
            <aside className="meta-threads">
              <div className="meta-list-title">
                <h1>客戶查詢</h1>
                <select
                  aria-label="篩選渠道"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="all">全部渠道</option>
                  <option value="messenger">Messenger</option>
                  <option value="instagram">Instagram</option>
                </select>
              </div>
              {!threads.length ? (
                <div className="meta-empty">
                  <span>↗</span>
                  <h2>
                    {overview?.connections.length
                      ? "等候第一則真實查詢"
                      : "先連接品牌渠道"}
                  </h2>
                  <p>接駁並收到 Meta 訊息後，客戶查詢會出現喺呢度。</p>
                </div>
              ) : (
                threads.map((t) => {
                  const c = overview?.connections.find(
                    (c) => c.id === t.connection_id,
                  );
                  return (
                    <button
                      key={t.id}
                      className={`meta-thread ${selected === t.id ? "selected" : ""}`}
                      onClick={() => void selectThread(t.id)}
                      disabled={busy}
                    >
                      <span className="meta-avatar">
                        {c?.channel === "instagram" ? "IG" : "M"}
                      </span>
                      <span>
                        <b>
                          客戶 · {t.peer_id.slice(-8)}{" "}
                          {t.unread_count ? `（${t.unread_count} 未讀）` : ""}
                        </b>
                        <small>
                          {c?.label} ·{" "}
                          {t.status === "resolved" ? "已處理" : "跟進中"}
                        </small>
                        <small>
                          {t.last_inbound_at
                            ? date(t.last_inbound_at)
                            : "未有客戶訊息"}
                        </small>
                      </span>
                    </button>
                  );
                })
              )}
              {overview?.nextCursor && (
                <button
                  className="meta-load"
                  onClick={async () => {
                    try {
                      const more = await request<Overview>(
                        `?before=${overview.nextCursor}`,
                      );
                      setOverview({
                        ...more,
                        threads: [
                          ...overview.threads,
                          ...more.threads.filter(
                            (t) => !overview.threads.some((x) => x.id === t.id),
                          ),
                        ],
                      });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "讀取失敗。");
                    }
                  }}
                >
                  載入較早查詢
                </button>
              )}
            </aside>
            <section className="meta-conversation" aria-label="對話內容">
              {!detail ? (
                <div className="meta-empty">
                  <span>◎</span>
                  <h2>{selected ? "讀取對話中…" : "每個查詢，都有下一步。"}</h2>
                  <p>選擇客戶對話，查看訊息、來源及跟進記錄。</p>
                </div>
              ) : (
                <>
                  <div className="meta-conversation-header">
                    <div>
                      <b>客戶 · {detail.thread.peer_id.slice(-8)}</b>
                      <small>
                        {connection?.label} ·{" "}
                        {connection?.channel === "instagram"
                          ? "Instagram"
                          : "Messenger"}
                      </small>
                    </div>
                    {overview?.canSend && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(
                            {
                              action:
                                detail.thread.status === "resolved"
                                  ? "reopen"
                                  : "resolve",
                              threadId: detail.thread.id,
                            },
                            "對話狀態已更新。",
                          )
                        }
                      >
                        {detail.thread.status === "resolved"
                          ? "重新跟進"
                          : "標記已處理"}
                      </button>
                    )}
                  </div>
                  <div className="meta-messages">
                    {!!detail.sources?.length && (
                      <p className="meta-source-evidence">
                        平台推薦來源：
                        {detail.sources
                          .map((s) => (s.adId ? `廣告 ${s.adId}` : date(s.at)))
                          .join(" · ")}
                      </p>
                    )}
                    {detail.hasMore && (
                      <button
                        className="meta-load"
                        onClick={async () => {
                          const id = selection.current;
                          try {
                            const older = await request<Detail>(
                              `?thread=${selected}&before=${detail.messages[0]?.seq}`,
                            );
                            if (selection.current === id)
                              setDetail({
                                ...detail,
                                messages: [
                                  ...older.messages,
                                  ...detail.messages,
                                ],
                                hasMore: older.hasMore,
                              });
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : "讀取失敗。",
                            );
                          }
                        }}
                      >
                        載入較早訊息
                      </button>
                    )}
                    {detail.messages.map((m) => (
                      <article
                        key={m.id}
                        className={`meta-message ${m.direction}`}
                      >
                        <p>{m.body}</p>
                        {m.referral && (
                          <div className="meta-referral">
                            平台來源證據
                            {typeof m.referral.ad_id === "string"
                              ? ` · 廣告 ${m.referral.ad_id}`
                              : " · 推薦／廣告入口"}
                          </div>
                        )}
                        <small>
                          {date(m.provider_at ?? m.created_at)} ·{" "}
                          {labels[m.state] ?? m.state}
                          {m.error_code ? ` · ${m.error_code}` : ""}
                        </small>
                        {m.provider_id && (
                          <details>
                            <summary>平台訊息 ID</summary>
                            <code>{m.provider_id}</code>
                          </details>
                        )}
                      </article>
                    ))}
                  </div>
                  <div className="meta-composer">
                    <div>
                      <button
                        className={!note ? "chosen" : ""}
                        onClick={() => setNote(false)}
                      >
                        回覆客戶
                      </button>
                      <button
                        className={note ? "chosen" : ""}
                        onClick={() => setNote(true)}
                      >
                        內部備註
                      </button>
                      <span>
                        {note
                          ? "只供團隊查看"
                          : windowOpen
                            ? "客戶服務時限內"
                            : "客戶服務時限已過"}
                      </span>
                    </div>
                    <label className="meta-sr" htmlFor="meta-draft">
                      {note ? "內部備註" : "回覆內容"}
                    </label>
                    <textarea
                      id="meta-draft"
                      placeholder={
                        note ? "記低下一步、重點或交接資料…" : "輸入回覆…"
                      }
                      rows={3}
                      maxLength={max}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      disabled={!overview?.canSend || busy}
                    />
                    <footer>
                      <small>
                        {Array.from(draft).length}/{max}
                        {!note && unresolved ? " · 有發送結果待核對" : ""}
                      </small>
                      {pendingThread === selected && (
                        <button disabled={busy} onClick={() => void send(true)}>
                          核對發送結果
                        </button>
                      )}
                      <button
                        className="meta-primary"
                        disabled={
                          busy ||
                          !draft.trim() ||
                          !overview?.canSend ||
                          (!note &&
                            (!windowOpen || !connection?.enabled || unresolved))
                        }
                        onClick={() => void send()}
                      >
                        {busy ? "處理中…" : note ? "儲存備註" : "發送回覆"}
                      </button>
                    </footer>
                    <small>
                      發送結果以 Meta
                      回傳為準。只顯示本系統收到及發出嘅訊息；附件可到原生平台查看。
                    </small>
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
