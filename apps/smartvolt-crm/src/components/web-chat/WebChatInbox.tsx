"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import useSWR from "swr";
import {
  ArrowLeft,
  Check,
  Globe2,
  MessageCircle,
  RefreshCw,
  Send,
  Link2,
  X,
} from "lucide-react";
import type {
  WebChatConversation,
  WebChatPage,
  WebChatThread,
} from "@/lib/web-chat/model";
import {
  pendingChatKey,
  pendingChatSnapshot,
  parsePendingChat,
  subscribePendingChat,
  savePendingChat,
  pendingChatMemoryOnly,
  type PendingChatAction,
} from "@/lib/web-chat/pending-store";
import "./web-chat.css";

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "未能讀取網站訊息。");
  return d;
}
function time(value: string) {
  return new Date(value).toLocaleString("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export default function WebChatInbox({
  companyId,
  actorId,
  initialThreadId,
  active = true,
}: {
  companyId: string;
  actorId: string;
  initialThreadId?: string;
  active?: boolean;
}) {
  const base = `/api/companies/${companyId}/web-chat/threads`;
  const [selected, setSelected] = useState(initialThreadId ?? ""),
    [filter, setFilter] = useState("open"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [cursor, setCursor] = useState(""),
    [older, setOlder] = useState<WebChatThread[]>([]),
    [olderScope, setOlderScope] = useState<string | undefined>(undefined),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [linkOpen, setLinkOpen] = useState(false),
    [customerId, setCustomerId] = useState(""),
    [extraMessages, setExtraMessages] = useState<
      WebChatConversation["messages"]
    >([]),
    [olderMessageCursor, setOlderMessageCursor] = useState<
      number | null | undefined
    >(undefined),
    [customerSearch, setCustomerSearch] = useState(""),
    [customerQuery, setCustomerQuery] = useState("");
  const pendingKey = pendingChatKey(companyId, actorId);
  const pendingSnapshot = useSyncExternalStore(
    subscribePendingChat,
    () => pendingChatSnapshot(pendingKey),
    () => "{}",
  );
  const pending = useMemo(
    () => parsePendingChat(pendingSnapshot),
    [pendingSnapshot],
  );
  const selectionGeneration = useRef(0),
    messageBox = useRef<HTMLDivElement>(null),
    followBottom = useRef(true),
    olderPosition = useRef<{
      height: number;
      top: number;
      generation: number;
    } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const error = errors[selected] ?? "",
    unresolved = !!pending[selected];
  function setError(message: string) {
    setErrors((previous) => ({ ...previous, [selected]: message }));
  }
  const listUrl =
    base +
    "?" +
    new URLSearchParams({
      status: filter,
      ...(query ? { search: query } : {}),
    }) +
    (cursor ? "&" + cursor : "");
  const list = useSWR<WebChatPage>(listUrl, get, {
    refreshInterval: active ? 12000 : 0,
    isPaused: () => !active,
    revalidateOnFocus: active,
    keepPreviousData: true,
  });
  const conversation = useSWR<WebChatConversation>(
    selected ? base + "?threadId=" + selected : null,
    get,
    {
      refreshInterval: active ? 5000 : 0,
      isPaused: () => !active,
      revalidateOnFocus: active,
    },
  );
  const thread = conversation.data?.thread,
    draft = drafts[selected] ?? pending[selected]?.body ?? "";
  const customers = useSWR<{
    customers: { id: string; name: string; phone: string }[];
  }>(
    linkOpen && customerQuery.trim() && thread
      ? `/api/companies/${companyId}/customers?` +
          new URLSearchParams({ brand: thread.brandId, search: customerQuery })
      : null,
    get,
    { isPaused: () => !active },
  );
  const rows = [
    ...new Map(
      [
        ...(olderScope === list.data?.scopeStamp ? older : []),
        ...(list.data?.threads ?? []),
      ].map((t) => [t.id, t]),
    ).values(),
  ];
  const messages = [
    ...new Map(
      [...(conversation.data?.messages ?? []), ...extraMessages].map((m) => [
        m.id,
        m,
      ]),
    ).values(),
  ].sort((a, b) => a.sequence - b.sequence);
  useEffect(() => {
    if (active) {
      void list.mutate();
      if (selected) void conversation.mutate();
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  function choose(id: string) {
    selectionGeneration.current++;
    followBottom.current = true;
    olderPosition.current = null;
    setLoadingOlder(false);
    setSelected(id);
    setExtraMessages([]);
    setOlderMessageCursor(undefined);
    setError("");
    setLinkOpen(false);
    setCustomerId("");
    setCustomerSearch("");
    setCustomerQuery("");
    const url = new URL(window.location.href);
    url.searchParams.set("provider", "website");
    if (id) url.searchParams.set("thread", id);
    else url.searchParams.delete("thread");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  async function action(
    kind: "reply" | "close" | "reopen" | "linkCustomer",
    reconcile = false,
  ) {
    if (!thread || busy || !active) return;
    const current = selected,
      existing = pending[current];
    if (existing && !reconcile) return;
    const body = (drafts[current] ?? "").trim();
    if (!existing && kind === "reply" && !body) return;
    const payload: PendingChatAction = existing ?? {
      action: kind,
      commandId: crypto.randomUUID(),
      threadId: current,
      revision: thread.revision,
      ...(kind === "reply" ? { body } : {}),
      ...(kind === "linkCustomer" ? { customerId: customerId.trim() } : {}),
    };
    if (!savePendingChat(pendingKey, current, payload)) {
      setErrors((previous) => ({
        ...previous,
        [current]: "有較多操作未確認，請先核對之前嘅操作。",
      }));
      return;
    }
    setBusy(true);
    setErrors((previous) => ({ ...previous, [current]: "" }));
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        if ([400, 401, 403, 404, 409, 429].includes(response.status)) {
          if (payload.action === "reply" && payload.body)
            setDrafts((previous) => ({
              ...previous,
              [current]: payload.body!,
            }));
          savePendingChat(pendingKey, current, null);
          await conversation.mutate();
        }
        throw new Error(result.error || "未能完成操作。");
      }
      savePendingChat(pendingKey, current, null);
      if (payload.action === "reply")
        setDrafts((previous) => ({ ...previous, [current]: "" }));
      setLinkOpen(false);
      await Promise.all([list.mutate(), conversation.mutate()]);
    } catch (e) {
      setErrors((previous) => ({
        ...previous,
        [current]:
          e instanceof TypeError
            ? "連線中斷，上次操作結果未確認。草稿已保留。"
            : e instanceof Error
              ? e.message
              : "未能完成操作。草稿已保留。",
      }));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const box = messageBox.current;
    if (!box) return;
    if (olderPosition.current?.generation === selectionGeneration.current) {
      box.scrollTop =
        olderPosition.current.top +
        (box.scrollHeight - olderPosition.current.height);
      olderPosition.current = null;
    } else if (followBottom.current) box.scrollTop = box.scrollHeight;
  }, [selected, conversation.data?.messages, extraMessages]);
  return (
    <div className={`wc-inbox ${selected ? "wc-has-thread" : ""}`}>
      <section className="wc-queue" aria-label="網站訊息清單">
        <header className="wc-queue-head">
          <div>
            <span className="wc-eyebrow">WEBSITE INBOX</span>
            <h1>網站訊息</h1>
          </div>
          <button
            className="wc-icon"
            aria-label="重新讀取網站訊息"
            onClick={() => {
              void list.mutate();
              void conversation.mutate();
            }}
          >
            <RefreshCw size={17} />
          </button>
        </header>
        <form
          className="wc-search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setCursor("");
            setOlder([]);
          }}
        >
          <input
            aria-label="搜尋網站訊息"
            placeholder="搜尋訪客或訊息…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={80}
          />
          <button type="submit">搜尋</button>
        </form>
        <div className="wc-filters">
          <button
            aria-pressed={filter === "open"}
            onClick={() => {
              setFilter("open");
              setCursor("");
              setOlder([]);
            }}
          >
            待跟進
          </button>
          <button
            aria-pressed={filter === "closed"}
            onClick={() => {
              setFilter("closed");
              setCursor("");
              setOlder([]);
            }}
          >
            已結束
          </button>
        </div>
        <div className="wc-thread-list">
          {list.error ? (
            <p role="alert" className="wc-error">
              {list.error.message}
            </p>
          ) : !list.data ? (
            <p role="status" className="wc-muted">
              正在讀取網站訊息…
            </p>
          ) : !rows.length ? (
            <div className="wc-empty">
              <Globe2 size={32} />
              <h2>等候第一個網站查詢</h2>
              <p>訪客嘅留言同同事回覆，都會留喺呢度。</p>
              <a href={`/company/${companyId}/settings/website-chat`}>
                設定官網聊天窗 →
              </a>
            </div>
          ) : (
            rows.map((t) => (
              <button
                key={t.id}
                className={`wc-thread ${selected === t.id ? "selected" : ""}`}
                onClick={() => choose(t.id)}
                aria-pressed={selected === t.id}
              >
                <span className="wc-avatar">
                  <Globe2 size={19} />
                </span>
                <span className="wc-thread-body">
                  <span className="wc-thread-title">
                    <strong>{t.visitorName}</strong>
                    <time>{time(t.lastMessageAt)}</time>
                  </span>
                  <span className="wc-thread-preview">
                    {t.preview || "未有留言"}
                  </span>
                  <span className="wc-thread-meta">
                    {t.brandName}
                    {t.unread && <span className="wc-dot">待回覆</span>}
                  </span>
                </span>
              </button>
            ))
          )}
          {list.data?.nextCursor && (
            <button
              className="wc-more"
              onClick={() => {
                setOlder(rows);
                setOlderScope(list.data?.scopeStamp);
                setCursor(list.data!.nextCursor!);
              }}
            >
              較早查詢
            </button>
          )}
        </div>
      </section>
      <section className="wc-conversation" aria-label="網站訪客對話">
        {!selected ? (
          <div className="wc-empty wc-full-empty">
            <MessageCircle size={38} />
            <h2>揀一段網站對話</h2>
            <p>真人接待，由一句問候開始。</p>
          </div>
        ) : conversation.error ? (
          <div className="wc-empty">
            <p role="alert" className="wc-error">
              {conversation.error.message}
            </p>
            <button onClick={() => void conversation.mutate()}>重新讀取</button>
          </div>
        ) : !thread ? (
          <p role="status" className="wc-muted">
            正在開啟對話…
          </p>
        ) : (
          <>
            <header className="wc-conversation-head">
              <button
                className="wc-icon wc-mobile-back"
                aria-label="返回網站訊息清單"
                onClick={() => choose("")}
              >
                <ArrowLeft size={19} />
              </button>
              <span className="wc-avatar">
                <Globe2 size={19} />
              </span>
              <div className="wc-heading">
                <h2>{thread.visitorName}</h2>
                <p>
                  {thread.brandName} · {thread.site}
                </p>
              </div>
              <button
                className="wc-secondary"
                disabled={!conversation.data?.canReply || busy || unresolved}
                onClick={() =>
                  void action(thread.status === "open" ? "close" : "reopen")
                }
              >
                {thread.status === "open" ? (
                  <>
                    <Check size={15} />
                    結束對話
                  </>
                ) : (
                  "重新開啟"
                )}
              </button>
            </header>
            <div className="wc-identity">
              <Link2 size={14} />
              {thread.customerId ? (
                <a
                  href={`/company/${companyId}/crm/customers?customerId=${encodeURIComponent(thread.customerId)}`}
                >
                  已連結客戶紀錄 →
                </a>
              ) : (
                <>
                  <span>未連結客戶</span>
                  {conversation.data?.canReply && (
                    <button
                      disabled={busy || unresolved}
                      onClick={() => setLinkOpen(!linkOpen)}
                    >
                      連結已有客戶
                    </button>
                  )}
                </>
              )}
            </div>
            {linkOpen && (
              <form
                className="wc-link-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action("linkCustomer");
                }}
              >
                <label>
                  搜尋已有客戶
                  <input
                    aria-label="搜尋要連結嘅客戶"
                    placeholder="姓名或電話…"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setCustomerId("");
                    }}
                    maxLength={100}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setCustomerQuery(customerSearch)}
                >
                  搜尋客戶
                </button>
                {customers.data && !customers.error && (
                  <label>
                    選擇客戶
                    <select
                      aria-label="選擇要連結嘅客戶"
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                    >
                      <option value="">請選擇</option>
                      {customers.data.customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.phone ? ` · ${c.phone}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {customers.error && (
                  <p role="alert">{customers.error.message}</p>
                )}
                {customers.data?.customers.length === 0 && (
                  <p>未有符合嘅客戶。</p>
                )}
                <p>請先核對身份；相同名字唔代表同一位客人。</p>
                <button
                  type="submit"
                  disabled={
                    busy ||
                    unresolved ||
                    !!customers.error ||
                    !customerId.trim()
                  }
                >
                  確認連結
                </button>
                <button
                  type="button"
                  className="wc-icon"
                  aria-label="取消連結"
                  onClick={() => setLinkOpen(false)}
                >
                  <X size={16} />
                </button>
              </form>
            )}
            <div
              className="wc-messages"
              ref={messageBox}
              onScroll={() => {
                const box = messageBox.current;
                if (box)
                  followBottom.current =
                    box.scrollHeight - box.scrollTop - box.clientHeight < 80;
              }}
              role="log"
              aria-label="網站對話訊息"
              aria-live="polite"
            >
              {messages.length ? (
                messages.map((m) => (
                  <article key={m.id} className={`wc-message ${m.direction}`}>
                    <p>{m.body}</p>
                    <small>
                      {m.direction === "incoming"
                        ? thread.visitorName
                        : m.actorName}{" "}
                      · {time(m.createdAt)}
                    </small>
                  </article>
                ))
              ) : (
                <p className="wc-muted">訪客未有發送訊息。</p>
              )}
              {(olderMessageCursor === undefined
                ? conversation.data?.nextCursor
                : olderMessageCursor) != null && (
                <button
                  className="wc-more"
                  disabled={loadingOlder}
                  onClick={async () => {
                    const requested = selected,
                      generation = selectionGeneration.current,
                      box = messageBox.current;
                    setLoadingOlder(true);
                    try {
                      const next = await get<WebChatConversation>(
                        base +
                          "?threadId=" +
                          requested +
                          "&beforeSequence=" +
                          (olderMessageCursor ?? conversation.data!.nextCursor),
                      );
                      if (generation !== selectionGeneration.current) return;
                      if (box)
                        olderPosition.current = {
                          height: box.scrollHeight,
                          top: box.scrollTop,
                          generation,
                        };
                      setExtraMessages((previous) => [
                        ...next.messages,
                        ...previous,
                      ]);
                      setOlderMessageCursor(next.nextCursor);
                    } catch (e) {
                      if (generation === selectionGeneration.current)
                        setError(
                          e instanceof Error ? e.message : "未能讀取更多訊息。",
                        );
                    } finally {
                      if (generation === selectionGeneration.current)
                        setLoadingOlder(false);
                    }
                  }}
                >
                  較早訊息
                </button>
              )}
            </div>
            <form
              className="wc-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void action("reply");
              }}
            >
              {error && (
                <p role="alert" className="wc-error">
                  {error}
                </p>
              )}
              {unresolved && !busy && (
                <div className="wc-pending" role="status">
                  <p>
                    上次操作結果未確認，請先核對同一操作。
                    {pendingChatMemoryOnly(pendingKey) &&
                      " 瀏覽器未能保存核對資料，請保持此頁面。"}
                  </p>
                  <button
                    type="button"
                    className="wc-secondary"
                    onClick={() => {
                      const record = pending[selected];
                      if (record) void action(record.action, true);
                    }}
                  >
                    核對同一操作
                  </button>
                </div>
              )}
              <label className="wc-sr" htmlFor="wc-reply">
                回覆網站訪客
              </label>
              <textarea
                id="wc-reply"
                aria-label="回覆網站訪客"
                placeholder={
                  thread.status === "closed" ? "對話已結束" : "輸入回覆…"
                }
                value={draft}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [selected]: e.target.value }))
                }
                maxLength={2000}
                disabled={
                  !conversation.data?.canReply ||
                  busy ||
                  unresolved ||
                  thread.status === "closed"
                }
              />
              <div className="wc-composer-foot">
                <span>
                  {!conversation.data?.canReply
                    ? "目前只可查看"
                    : "以同事身份回覆"}{" "}
                  · {draft.length}/2000
                </span>
                <button
                  className="wc-primary"
                  type="submit"
                  disabled={
                    !conversation.data?.canReply ||
                    busy ||
                    unresolved ||
                    thread.status === "closed" ||
                    !draft.trim()
                  }
                >
                  <Send size={15} />
                  {busy ? "發送中…" : "發送回覆"}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
