"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Inbox,
  RefreshCw,
  Search,
  Send,
  UsersRound,
  Workflow,
  Bot,
  Settings2,
  Store,
  ChevronRight,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import ThreadOperationsPanel, {
  type OperationDraft,
} from "@/components/meta/ThreadOperations";
import AIDraft from "@/components/ai/AIDraft";
import { inboxQueues } from "@/lib/meta/operations";
import {
  actionSchema,
  channelNames,
  type InboxPage,
  type Inquiry,
  type CustomerDetail,
  type InquiryDetail,
} from "@/lib/inquiries/model";
import CustomerPanel, { type Mutate } from "./CustomerPanel";
const labels: Record<string, string> = {
  received: "已收取",
  dispatching: "發送中・待核對",
  sending: "發送中・待核對",
  unknown: "結果待核對",
  uncertain: "結果待核對",
  accepted: "平台已接受",
  sent: "已傳送",
  delivered: "已送達",
  read: "已讀",
  failed: "未能發送",
  note: "內部備註",
};
const date = (v: number | string) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(v));
export default function UnifiedInbox({
  companyId,
  companyName,
  hasPos,
  initialThread,
  initialProvider,
  initialCustomer,
}: {
  companyId: string;
  companyName: string;
  hasPos: boolean;
  initialThread?: string;
  initialProvider?: string;
  initialCustomer?: string;
}) {
  const base = `/api/companies/${companyId}`;
  const [overview, setOverview] = useState<InboxPage | null>(null),
    [detail, setDetail] = useState<InquiryDetail | null>(null),
    [selected, setSelected] = useState<{
      id: string;
      provider: "meta" | "whatsapp";
    } | null>(
      initialThread &&
        (initialProvider === "meta" || initialProvider === "whatsapp")
        ? { id: initialThread, provider: initialProvider }
        : null,
    ),
    [queue, setQueue] = useState("all"),
    [channel, setChannel] = useState("all"),
    [search, setSearch] = useState(""),
    [input, setInput] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [now, setNow] = useState(0),
    [standalone, setStandalone] = useState<CustomerDetail | null>(null),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{
      endpoint: "inbox" | "customers";
      data: unknown;
    } | null>(null),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [note, setNote] = useState(false),
    [mobile, setMobile] = useState(initialThread ? "chat" : "list"),
    [aside, setAside] = useState("customer"),
    [operationCache, setOperationCache] = useState<
      Record<string, OperationDraft | undefined>
    >({}),
    [quote, setQuote] = useState<{ id: string; body: string } | null>(null);
  const selectedRef = useRef(selected),
    queryRef = useRef(""),
    busyRef = useRef(false),
    messageBox = useRef<HTMLDivElement>(null),
    refreshGeneration = useRef(0);
  const key = selected ? selected.provider + ":" + selected.id : "",
    query = new URLSearchParams({ queue, channel, search }).toString();
  useEffect(() => {
    selectedRef.current = selected;
    queryRef.current = query;
  }, [selected, query]);
  const request = useCallback(
    async <T,>(
      path: string,
      data?: unknown,
      signal?: AbortSignal,
    ): Promise<T> => {
      const r = await fetch(base + "/" + path, {
        method: data ? "POST" : "GET",
        headers: data ? { "Content-Type": "application/json" } : undefined,
        body: data ? JSON.stringify(data) : undefined,
        cache: "no-store",
        signal,
      });
      const value = await r.json();
      if (!r.ok)
        throw Object.assign(new Error(value.error ?? "暫時未能完成操作。"), {
          status: r.status,
        });
      return value as T;
    },
    [base],
  );
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const expected = selectedRef.current,
        q = queryRef.current,
        generation = ++refreshGeneration.current;
      const [o, d, customer] = await Promise.all([
        request<InboxPage>("inbox?" + q, undefined, signal),
        expected
          ? request<InquiryDetail>(
              "inbox?" +
                new URLSearchParams({
                  provider: expected.provider,
                  thread: expected.id,
                }),
              undefined,
              signal,
            )
          : Promise.resolve(null),
        initialCustomer && !expected
          ? request<CustomerDetail>(
              "customers?id=" + encodeURIComponent(initialCustomer),
              undefined,
              signal,
            )
          : Promise.resolve(null),
      ]);
      if (signal?.aborted || generation !== refreshGeneration.current) return;
      setNow(Date.now());
      if (customer) setStandalone(customer);
      if (q === queryRef.current) setOverview(o);
      if (
        expected?.id === selectedRef.current?.id &&
        expected?.provider === selectedRef.current?.provider
      )
        setDetail((current) => {
          if (!d) return null;
          if (!current || current.thread.key !== d.thread.key) return d;
          const older = current.messages.filter(
            (m) => m.seq < (d.messages[0]?.seq ?? 0),
          );
          return {
            ...d,
            messages: [...older, ...d.messages],
            nextBefore: older.length ? current.nextBefore : d.nextBefore,
          };
        });
    },
    [request, initialCustomer],
  );
  useEffect(() => {
    const ctl = new AbortController();
    let running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        await refresh(ctl.signal);
        if (!ctl.signal.aborted) setError("");
      } catch (e) {
        if (!ctl.signal.aborted) setError((e as Error).message);
      } finally {
        running = false;
        if (!ctl.signal.aborted) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !busyRef.current)
        void load();
    }, 15000);
    return () => {
      ctl.abort();
      clearInterval(timer);
    };
  }, [refresh, query, key]);
  useEffect(() => {
    if (!initialCustomer) return;
    const controller = new AbortController();
    void request<CustomerDetail>(
      "customers?id=" + encodeURIComponent(initialCustomer),
      undefined,
      controller.signal,
    )
      .then((d) => {
        if (controller.signal.aborted) return;
        setStandalone(d);
        const first = d.links[0];
        if (first && !selectedRef.current) {
          const provider = first.provider;
          if (provider === "meta" || provider === "whatsapp")
            setSelected({ id: first.thread_id, provider });
          setMobile("chat");
        }
        if (!first) setMobile("profile");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [initialCustomer, request]);
  const newestMessageId = detail?.messages.at(-1)?.id;
  useEffect(() => {
    const box = messageBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [key, newestMessageId]);
  const mutate: Mutate = async (endpoint, data) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setPending({ endpoint, data });
    try {
      await request(endpoint, data);
      setPending(null);
      const saved = actionSchema.safeParse(data);
      if (
        saved.success &&
        (saved.data.action === "send" || saved.data.action === "note")
      ) {
        const s = saved.data,
          k = s.provider + ":" + s.threadId;
        setDrafts((old) => ({ ...old, [k]: old[k] === s.body ? "" : old[k] }));
      }
      setNotice("已儲存並同步公司資料。");
      try {
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      }
      return true;
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status && status < 500) {
        setPending(null);
        setError((e as Error).message);
        try {
          await refresh();
        } catch {}
        return false;
      }
      setError("連線結果未確認，請核對同一操作；草稿仍然保留。");
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  function select(t: Inquiry) {
    if (busy || pending) return;
    setSelected({ id: t.id, provider: t.provider });
    setDetail(null);
    setQuote(null);
    setNotice("");
    setError("");
    setMobile("chat");
    const u = new URL(window.location.href);
    u.searchParams.set("provider", t.provider);
    u.searchParams.set("thread", t.id);
    window.history.replaceState(null, "", u.pathname + u.search);
  }
  async function more() {
    if (!overview?.nextCursor || busy) return;
    setBusy(true);
    const expected = query;
    try {
      const d = await request<InboxPage>(
        "inbox?" + query + "&cursor=" + encodeURIComponent(overview.nextCursor),
      );
      if (queryRef.current === expected)
        setOverview((o) =>
          o
            ? {
                ...d,
                threads: [
                  ...new Map(
                    [...o.threads, ...d.threads].map((t) => [t.key, t]),
                  ).values(),
                ],
              }
            : d,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function older() {
    if (!detail?.nextBefore || !selected) return;
    const currentKey = key;
    setBusy(true);
    try {
      const d = await request<InquiryDetail>(
        "inbox?" +
          new URLSearchParams({
            provider: selected.provider,
            thread: selected.id,
            before: String(detail.nextBefore),
          }),
      );
      if (
        currentKey ===
        selectedRef.current?.provider + ":" + selectedRef.current?.id
      )
        setDetail((old) =>
          old
            ? {
                ...old,
                messages: [
                  ...new Map(
                    [...d.messages, ...old.messages].map((m) => [m.id, m]),
                  ).values(),
                ].sort((a, b) => a.seq - b.seq),
                nextBefore: d.nextBefore,
              }
            : d,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const unresolved = detail?.messages.some(
    (m) =>
      m.direction === "outgoing" &&
      ["dispatching", "sending", "unknown", "uncertain"].includes(m.state),
  );
  const openWindow =
    !!detail?.thread.last_inbound_at &&
    now - detail.thread.last_inbound_at < 86400000;
  const draft = drafts[key] ?? "",
    locked = busy || !!pending,
    canEdit = overview?.canEdit ?? false;
  async function send() {
    if (!detail || !selected || !draft.trim()) return;
    const body = draft;
    const ok = await mutate("inbox", {
      action: note ? "note" : "send",
      provider: selected.provider,
      threadId: selected.id,
      commandId: crypto.randomUUID(),
      revision: detail.thread.revision,
      body,
      ...(!note && quote && selected.provider === "whatsapp"
        ? { replyTo: quote.id }
        : {}),
    });
    if (ok) {
      setDrafts((old) => ({
        ...old,
        [key]: old[key] === body ? "" : old[key],
      }));
      setQuote(null);
      setNotice(
        note ? "內部備註已儲存。" : "訊息已提交，送達狀態以平台回執為準。",
      );
    }
  }
  return (
    <main className="iq-app" data-mobile={mobile}>
      <header className="iq-header">
        <Link href={`/company/${companyId}/crm`} className="iq-brand">
          <BrandMark />
          <b>Convelta</b>
          <span>CRM</span>
        </Link>
        <span className="iq-company">{companyName}</span>
        <nav aria-label="產品及設定">
          {hasPos && (
            <Link href={`/company/${companyId}/pos`}>
              <Store size={15} />
              切換 POS
            </Link>
          )}
          <Link href={`/company/${companyId}/settings`} aria-label="公司設定">
            <Settings2 size={17} />
          </Link>
        </nav>
      </header>
      <nav className="iq-rail" aria-label="CRM 功能">
        <Link aria-current="page" href={`/company/${companyId}/crm`}>
          <Inbox size={19} />
          <span>收件匣</span>
        </Link>
        <Link href={`/company/${companyId}/crm/customers`}>
          <UsersRound size={19} />
          <span>客戶</span>
        </Link>
        <Link href={`/company/${companyId}/crm?view=flows`}>
          <Workflow size={19} />
          <span>Flow</span>
        </Link>
        <Link href={`/company/${companyId}/crm/ai`}>
          <Bot size={19} />
          <span>AI</span>
        </Link>
        <Link href={`/company/${companyId}/crm?view=broadcasts`}>
          <Send size={19} />
          <span>推播</span>
        </Link>
      </nav>
      <section className="iq-list" aria-label="全渠道查詢">
        <div className="iq-list-heading">
          <div>
            <small>CUSTOMER OPERATIONS</small>
            <h1>每段對話，都有下一步。</h1>
          </div>
          <button
            aria-label="重新整理收件匣"
            disabled={locked}
            onClick={() => void refresh().catch((e) => setError(e.message))}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        <form
          className="iq-search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(input);
          }}
        >
          <Search size={17} />
          <input
            aria-label="搜尋客戶或電話"
            placeholder="搜尋客戶、電話…"
            maxLength={100}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button>搜尋</button>
        </form>
        <label className="iq-channel-filter">
          渠道
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            disabled={locked}
          >
            <option value="all">全部渠道</option>
            {Object.entries(channelNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="iq-queues" aria-label="工作清單">
          {Object.entries(inboxQueues).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={queue === id}
              disabled={locked}
              onClick={() => setQueue(id)}
            >
              {label}
              <span>{overview?.counts[id] ?? "—"}</span>
            </button>
          ))}
        </div>
        <div className="iq-thread-list">
          {loading && !overview ? (
            <p className="iq-empty-small">正在讀取公司查詢…</p>
          ) : !overview?.threads.length ? (
            <div className="iq-empty">
              <Inbox size={32} />
              <h2>呢個清單未有查詢</h2>
              <p>已接駁渠道嘅真實來訊會顯示喺呢度。</p>
              <Link href={`/company/${companyId}/settings/whatsapp`}>
                設定 WhatsApp
              </Link>
              <Link href={`/company/${companyId}/crm/meta`}>
                設定 Messenger／Instagram
              </Link>
            </div>
          ) : (
            overview.threads.map((t) => (
              <button
                className={`iq-thread-row ${key === t.key ? "is-selected" : ""}`}
                key={t.key}
                disabled={locked}
                onClick={() => select(t)}
              >
                <span className="iq-avatar">
                  {(t.customer_name || t.name).slice(0, 1)}
                </span>
                <div>
                  <div className="iq-row-title">
                    <strong>{t.customer_name || t.name}</strong>
                    <time>{date(t.updated_at)}</time>
                  </div>
                  <p>{t.preview || "未有訊息內容"}</p>
                  <div className="iq-row-meta">
                    <span className={`iq-channel is-${t.channel}`}>
                      {channelNames[t.channel]}
                    </span>
                    {t.priority !== "normal" && (
                      <span className="iq-priority">
                        {t.priority === "urgent" ? "緊急" : "優先"}
                      </span>
                    )}
                    {t.follow_up_at &&
                      new Date(t.follow_up_at).getTime() <= now &&
                      t.status === "open" && (
                        <span className="iq-priority">到期</span>
                      )}
                    {t.unread_count > 0 && (
                      <b className="iq-unread">{t.unread_count}</b>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        {overview?.nextCursor && (
          <button
            className="iq-more"
            disabled={locked}
            onClick={() => void more()}
          >
            載入更多查詢
          </button>
        )}
        <footer className="iq-connections">
          {overview && !overview.connections.length ? (
            <span>渠道尚未接駁</span>
          ) : (
            overview?.connections.map((c, i) => (
              <span key={i}>
                <i
                  className={
                    c.state === "active" || c.state === "inbound-observed"
                      ? "active"
                      : ""
                  }
                />
                {c.label} ·{" "}
                {c.state === "disabled"
                  ? "已停用"
                  : c.state === "active" || c.state === "inbound-observed"
                    ? "已收到來訊"
                    : "待收發驗收"}
              </span>
            ))
          )}
        </footer>
      </section>
      <section className="iq-chat" aria-label="客戶對話">
        {selected && detail ? (
          <>
            <header className="iq-chat-heading">
              <button
                className="iq-mobile-back"
                aria-label="返回查詢清單"
                onClick={() => setMobile("list")}
              >
                <ArrowLeft size={19} />
              </button>
              <div>
                <h2>{detail.customer.name}</h2>
                <small>
                  {channelNames[detail.thread.channel]} ·{" "}
                  {overview?.brands.find((b) => b.id === detail.thread.brand_id)
                    ?.name ?? "品牌查詢"}
                </small>
              </div>
              <button
                className="iq-mobile-profile"
                onClick={() => {
                  setAside("customer");
                  setMobile("profile");
                }}
              >
                客戶資料
                <ChevronRight size={15} />
              </button>
              {canEdit && (
                <button
                  disabled={locked}
                  onClick={() => {
                    const last = detail.messages.at(-1);
                    if (last)
                      void mutate("inbox", {
                        action: "read",
                        provider: selected.provider,
                        threadId: selected.id,
                        commandId: crypto.randomUUID(),
                        revision: detail.thread.revision,
                        messageId: last.id,
                        through: last.seq,
                      });
                  }}
                >
                  標記已讀
                </button>
              )}
            </header>
            <div
              className="iq-messages"
              ref={messageBox}
              role="log"
              aria-label="對話訊息"
            >
              {detail.nextBefore && (
                <button
                  disabled={locked}
                  className="iq-older"
                  onClick={() => void older()}
                >
                  載入較早訊息
                </button>
              )}
              {detail.messages.map((m) => (
                <article key={m.id} className={`iq-message is-${m.direction}`}>
                  <div>
                    {m.direction === "note" && <b>內部備註</b>}
                    <p>{m.body}</p>
                    <footer>
                      <time>{date(m.at)}</time>
                      {m.direction === "outgoing" && (
                        <span>{labels[m.state] ?? m.state}</span>
                      )}
                    </footer>
                  </div>
                  {m.direction === "incoming" &&
                    detail.thread.provider === "whatsapp" && (
                      <button
                        disabled={locked}
                        aria-label="引用此訊息"
                        onClick={() => setQuote({ id: m.id, body: m.body })}
                      >
                        引用
                      </button>
                    )}
                </article>
              ))}
            </div>
            <form
              className="iq-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <div className="iq-compose-tabs">
                <button
                  type="button"
                  aria-pressed={!note}
                  onClick={() => setNote(false)}
                  disabled={locked}
                >
                  回覆客戶
                </button>
                <button
                  type="button"
                  aria-pressed={note}
                  onClick={() => {
                    setNote(true);
                    setQuote(null);
                  }}
                  disabled={locked}
                >
                  內部備註
                </button>
                <button
                  type="button"
                  className="iq-assistant-toggle"
                  onClick={() => {
                    setAside("operations");
                    setMobile("profile");
                  }}
                >
                  AI 及跟進 <ArrowUpRight size={13} />
                </button>
              </div>
              {quote && !note && (
                <div className="iq-quote">
                  <span>{quote.body}</span>
                  <button
                    type="button"
                    onClick={() => setQuote(null)}
                    aria-label="取消引用"
                  >
                    ×
                  </button>
                </div>
              )}
              <label className="iq-sr-only" htmlFor="iq-reply">
                {note ? "內部備註" : "回覆草稿"}
              </label>
              <textarea
                id="iq-reply"
                rows={3}
                maxLength={2000}
                value={draft}
                disabled={!canEdit || locked}
                onChange={(e) =>
                  setDrafts((old) => ({ ...old, [key]: e.target.value }))
                }
                placeholder={
                  note ? "只供團隊查看…" : "輸入回覆，或者加入 AI 建議…"
                }
              />
              <div className="iq-compose-footer">
                <small>
                  {!canEdit
                    ? "你目前只有檢視權限"
                    : note
                      ? "內部備註唔會發送畀客戶"
                      : unresolved
                        ? "上一則結果待核對，請先重新讀取回執"
                        : !openWindow
                          ? "服務視窗已過；可記錄內部備註"
                          : "使用此對話原本渠道回覆"}
                </small>
                <button
                  className="iq-primary"
                  disabled={
                    !canEdit ||
                    locked ||
                    !draft.trim() ||
                    (!note && (!openWindow || unresolved))
                  }
                >
                  <Send size={15} />
                  {note ? "儲存備註" : "傳送回覆"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="iq-welcome">
            <span>
              <CalendarDays size={30} />
            </span>
            <h2>{selected ? "正在讀取對話…" : "由對話開始，跟進每一步。"}</h2>
            <p>選擇查詢，查看客戶資料、分派同事同安排預約。</p>
          </div>
        )}
      </section>
      <section className="iq-context" aria-label="客戶與跟進">
        <header>
          <button
            className="iq-mobile-back"
            onClick={() => setMobile("chat")}
            aria-label="返回對話"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            aria-pressed={aside === "customer"}
            onClick={() => setAside("customer")}
          >
            客戶與預約
          </button>
          <button
            aria-pressed={aside === "operations"}
            onClick={() => setAside("operations")}
          >
            AI 及跟進
          </button>
        </header>
        {detail && overview ? (
          <>
            {aside === "customer" ? (
              <CustomerPanel
                key={detail.customer.id}
                data={detail}
                thread={detail.thread}
                companyId={companyId}
                hasPos={hasPos}
                canEdit={canEdit}
                busy={locked}
                mutate={mutate}
                onLoadMore={() => {
                  void request<import("@/lib/inquiries/model").CustomerDetail>(
                    `customers?id=${encodeURIComponent(detail.customer.id)}&before=${detail.nextEvent}`,
                  )
                    .then((d) =>
                      setDetail((old) =>
                        old
                          ? {
                              ...old,
                              events: [...old.events, ...d.events],
                              nextEvent: d.nextEvent,
                            }
                          : old,
                      ),
                    )
                    .catch((e) => setError(e.message));
                }}
              />
            ) : (
              <>
                <div className="iq-assignment-shortcut">
                  <button
                    disabled={!canEdit || locked}
                    onClick={() =>
                      void mutate("inbox", {
                        action: "auto-assign",
                        provider: detail.thread.provider,
                        threadId: detail.thread.id,
                        commandId: crypto.randomUUID(),
                        revision: detail.thread.revision,
                      })
                    }
                  >
                    按在手查詢量分派
                  </button>
                  <small>只會選擇在職、有操作權限嘅同事。</small>
                </div>
                <ThreadOperationsPanel
                  key={key}
                  thread={detail.thread}
                  members={overview.members}
                  actorId={overview.actorId}
                  canEdit={canEdit}
                  busy={locked}
                  now={now}
                  activity={detail.activity}
                  cached={operationCache[key]}
                  onDraft={(v) =>
                    setOperationCache((old) => ({ ...old, [key]: v }))
                  }
                  onSave={(c) =>
                    mutate("inbox", { ...c, provider: detail.thread.provider })
                  }
                  assistant={
                    <AIDraft
                      key={key}
                      context={{
                        companyId,
                        brandId: detail.thread.brand_id,
                        source:
                          detail.thread.provider === "meta"
                            ? "meta"
                            : "whatsapp",
                        threadId: detail.thread.id,
                      }}
                      disabled={!canEdit || locked}
                      onInsert={(text) => {
                        setDrafts((old) => ({ ...old, [key]: text }));
                        setMobile("chat");
                      }}
                    />
                  }
                />
              </>
            )}
          </>
        ) : standalone ? (
          <CustomerPanel
            data={standalone}
            companyId={companyId}
            hasPos={hasPos}
            canEdit={canEdit}
            busy={locked}
            mutate={mutate}
          />
        ) : (
          <div className="iq-empty-small">
            <UsersRound size={25} />
            <p>客戶檔案、預約及交接紀錄會喺呢度顯示。</p>
          </div>
        )}
      </section>
      {(error || notice || pending) && (
        <div
          className={`iq-feedback ${error ? "is-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error || notice}
          {pending && !busy && (
            <button onClick={() => void mutate(pending.endpoint, pending.data)}>
              核對同一操作
            </button>
          )}
        </div>
      )}
    </main>
  );
}
