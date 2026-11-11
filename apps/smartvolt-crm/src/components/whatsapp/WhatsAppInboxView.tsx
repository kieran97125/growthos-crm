import {
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  Clock3,
  ExternalLink,
  Inbox,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import type { RefObject } from "react";
import type {
  WaConnectionSummary,
  WaConversationSummary,
  WaMessageSummary,
} from "@/lib/whatsapp/responses";
import { serviceWindowOpen, whatsappTime } from "./transport";

export type PendingSend = {
  clientId: string;
  body: string;
  replyTo?: string;
  revision: number;
  phase: "sending" | "uncertain";
};
export type WhatsAppInboxViewProps = {
  companyId: string;
  companyName: string;
  canSend: boolean;
  canManage: boolean;
  connections: WaConnectionSummary[];
  conversations: WaConversationSummary[];
  selected: WaConversationSummary | null;
  messages: WaMessageSummary[];
  loading: boolean;
  messagesLoading: boolean;
  error: string | null;
  messageError: string | null;
  query: string;
  draft: string;
  quote: WaMessageSummary | null;
  pending: PendingSend | null;
  nextCursor: string | null;
  nextBefore: number | null;
  loadingMore: boolean;
  now: number;
  atBottom: boolean;
  actionBusy: boolean;
  listRef?: RefObject<HTMLDivElement | null>;
  onQuery?: (value: string) => void;
  onSelect?: (id: string) => void;
  onBack?: () => void;
  onDraft?: (value: string) => void;
  onQuote?: (message: WaMessageSummary | null) => void;
  onSend?: () => void;
  onRetry?: () => void;
  onRefresh?: () => void;
  onMore?: () => void;
  onOlder?: () => void;
  onScroll?: () => void;
  onLatest?: () => void;
  onResolve?: () => void;
};

export function Receipt({ state }: { state: WaMessageSummary["state"] }) {
  const label = {
    dispatching: "傳送處理中",
    accepted: "Meta 已接收",
    unknown: "結果待核實",
    sent: "已傳送",
    delivered: "已送達",
    read: "已讀",
    failed: "傳送失敗",
  }[state];
  const Icon =
    state === "delivered" || state === "read"
      ? CheckCheck
      : state === "sent" || state === "accepted"
        ? Check
        : state === "failed" || state === "unknown"
          ? CircleAlert
          : Clock3;
  return (
    <span className={`wa-receipt wa-receipt-${state}`}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </span>
  );
}

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      className={`wa-avatar${small ? " wa-avatar-small" : ""}`}
      aria-hidden="true"
    >
      {Array.from(name).slice(0, 1).join("") || <UserRound size={20} />}
    </span>
  );
}

export default function WhatsAppInboxView({
  listRef,
  ...p
}: WhatsAppInboxViewProps) {
  const draftLength = Array.from(p.draft).length;
  const connected = p.connections.some((c) => c.state !== "disabled");
  const selectedConnection = p.connections.find(
    (c) => c.id === p.selected?.connectionId,
  );
  const windowOpen = serviceWindowOpen(
    p.selected?.lastInboundAt ?? null,
    p.now,
  );
  const connectionReady =
    selectedConnection?.state === "active" &&
    !!selectedConnection.webhookVerifiedAt;
  const disabled =
    !p.canSend || !windowOpen || !!p.pending || !p.selected || !connectionReady;
  return (
    <main className={`wa-shell ${p.selected ? "wa-has-selection" : ""}`}>
      <header className="wa-topbar">
        <a
          className="wa-backlink"
          href={`/company/${p.companyId}`}
          aria-label="返回 CRM 工作台"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>CRM 工作台</span>
        </a>
        <div className="wa-topbrand">
          <span className="wa-brand-icon">
            <MessageCircle size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>WhatsApp 收件箱</strong>
            <span>{p.companyName}</span>
          </div>
        </div>
        <a
          className="wa-icon-button"
          href={`/company/${p.companyId}/settings/whatsapp`}
          aria-label="WhatsApp 連接設定"
        >
          <Settings2 size={19} />
        </a>
      </header>
      {p.error && (
        <div className="wa-alert wa-page-alert" role="alert">
          <CircleAlert size={17} aria-hidden="true" />
          <span>{p.error} 目前保留上次讀取嘅資料。</span>
          <button type="button" onClick={p.onRefresh}>
            重新讀取
          </button>
        </div>
      )}
      <div className="wa-inbox-grid">
        <section className="wa-conversation-panel" aria-label="對話列表">
          <div className="wa-list-title">
            <div>
              <span className="wa-eyebrow">CUSTOMER CONVERSATIONS</span>
              <h1>每個查詢，都跟進。</h1>
            </div>
            <span className="wa-count">
              {p.conversations.filter((c) => c.status === "open").length}
            </span>
          </div>
          <label className="wa-search">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="搜尋已載入嘅對話"
              placeholder="搜尋客戶或電話"
              value={p.query}
              onChange={(e) => p.onQuery?.(e.target.value)}
            />
          </label>
          <div className="wa-list-meta">
            <span>所有已載入對話</span>
            <button
              className="wa-text-button"
              onClick={p.onRefresh}
              aria-label="重新讀取對話"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="wa-conversation-list">
            {p.loading && (
              <div className="wa-empty" role="status">
                <RefreshCw size={23} className="wa-spin" aria-hidden="true" />
                <h2>讀取真實對話中</h2>
                <p>正在核實此公司嘅 WhatsApp 連接。</p>
              </div>
            )}
            {!p.loading && !connected && p.error && (
              <div className="wa-empty">
                <CircleAlert size={27} aria-hidden="true" />
                <h2>暫時未能核實連接</h2>
                <p>請重新讀取，核實公司 WhatsApp 狀態後再繼續。</p>
                <button className="wa-secondary" onClick={p.onRefresh}>
                  重新讀取
                </button>
              </div>
            )}
            {!p.loading && !connected && !p.error && (
              <div className="wa-empty">
                <span className="wa-empty-icon">
                  <MessageCircle size={29} />
                </span>
                <h2>接通你嘅公司號碼</h2>
                <p>
                  完成 Meta 連接及 webhook 驗證後，客戶傳入嘅訊息會顯示喺呢度。
                </p>
                <a
                  className="wa-primary"
                  href={`/company/${p.companyId}/settings/whatsapp`}
                >
                  {p.canManage ? "設定 WhatsApp" : "查看連接狀態"}
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              </div>
            )}
            {!p.loading && connected && p.conversations.length === 0 && (
              <div className="wa-empty">
                <Inbox size={30} aria-hidden="true" />
                <h2>{p.query ? "搵唔到已載入嘅對話" : "等候第一個客戶訊息"}</h2>
                <p>
                  {p.query
                    ? "試下其他客戶名稱，或者載入更多對話。"
                    : "呢度只顯示實際收發記錄。請由另一個 WhatsApp 帳戶向已接通號碼發訊息。"}
                </p>
              </div>
            )}
            {p.conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`wa-conversation${p.selected?.id === c.id ? " is-selected" : ""}`}
                onClick={() => p.onSelect?.(c.id)}
                aria-pressed={p.selected?.id === c.id}
              >
                <Avatar name={c.customerName} />
                <span className="wa-conversation-copy">
                  <span className="wa-conversation-head">
                    <strong>{c.customerName}</strong>
                    <time>{whatsappTime(c.lastMessageAt)}</time>
                  </span>
                  <span className="wa-preview">
                    {c.lastMessagePreview || "未有可預覽訊息"}
                  </span>
                  <span className="wa-conversation-foot">
                    <span>
                      {c.hasAdReferral && (
                        <>
                          <Megaphone size={11} aria-hidden="true" />
                          曾由廣告進入
                        </>
                      )}
                      {!c.hasAdReferral &&
                        (c.status === "resolved" ? "已完成" : "WhatsApp")}
                    </span>
                    {c.unreadCount > 0 && (
                      <b
                        className="wa-unread"
                        aria-label={`${c.unreadCount} 個未讀訊息`}
                      >
                        {c.unreadCount > 99 ? "99+" : c.unreadCount}
                      </b>
                    )}
                  </span>
                </span>
              </button>
            ))}
            {p.nextCursor && (
              <button
                className="wa-load-more"
                onClick={p.onMore}
                disabled={p.loadingMore}
              >
                {p.loadingMore ? "讀取中…" : "載入更多對話"}
                <ChevronDown size={15} aria-hidden="true" />
              </button>
            )}
          </div>
          <footer className="wa-list-footer">
            <ShieldCheck size={14} aria-hidden="true" />
            此公司專屬 · 只顯示實際訊息
          </footer>
        </section>
        <section className="wa-chat-panel" aria-label="客戶對話">
          {!p.selected ? (
            <div className="wa-chat-welcome">
              <span className="wa-welcome-mark">
                <MessageCircle size={40} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <span className="wa-eyebrow">A THOUGHTFUL REPLY STARTS HERE</span>
              <h2>讓好對話，變成好關係。</h2>
              <p>選擇一個客戶查詢，查看訊息同實際送達狀態。</p>
              <span className="wa-subtle-pill">
                <span />
                人工回覆 · 公司獨立資料
              </span>
            </div>
          ) : (
            <>
              <header className="wa-chat-header">
                <button
                  className="wa-icon-button wa-mobile-back"
                  aria-label="返回對話列表"
                  onClick={p.onBack}
                >
                  <ArrowLeft size={20} />
                </button>
                <Avatar name={p.selected.customerName} small />
                <div className="wa-chat-title">
                  <h2>{p.selected.customerName}</h2>
                  <span>
                    {p.selected.customerPhone || "WhatsApp 用戶"}
                    <i>·</i>
                    {p.selected.status === "resolved" ? "已完成" : "跟進中"}
                  </span>
                </div>
                <button
                  className="wa-secondary wa-resolve"
                  onClick={p.onResolve}
                  disabled={!p.canSend || p.actionBusy}
                >
                  {p.actionBusy
                    ? "處理中…"
                    : p.selected.status === "resolved"
                      ? "重新開啟"
                      : "完成對話"}
                  <Check size={14} aria-hidden="true" />
                </button>
              </header>
              <div className="wa-context-strip">
                <span>
                  <MessageCircle size={13} aria-hidden="true" />
                  {selectedConnection?.displayPhone || "公司 WhatsApp"}
                </span>
                {p.selected.hasAdReferral && (
                  <span>
                    <Megaphone size={13} aria-hidden="true" />
                    曾由廣告進入
                  </span>
                )}
                <span className={windowOpen ? "wa-window-open" : ""}>
                  <Clock3 size={13} aria-hidden="true" />
                  {windowOpen ? "24 小時回覆時段內" : "需要核准範本"}
                </span>
              </div>
              {p.messageError && (
                <div className="wa-alert" role="alert">
                  <CircleAlert size={16} aria-hidden="true" />
                  <span>{p.messageError}</span>
                  <button onClick={p.onRefresh}>重新核對</button>
                </div>
              )}
              <div
                className="wa-messages"
                ref={listRef}
                onScroll={p.onScroll}
                tabIndex={0}
                aria-label="訊息記錄（可捲動）"
              >
                {p.messagesLoading && p.messages.length === 0 && (
                  <div className="wa-empty" role="status">
                    <RefreshCw
                      className="wa-spin"
                      size={22}
                      aria-hidden="true"
                    />
                    <p>讀取訊息中…</p>
                  </div>
                )}
                {p.nextBefore !== null && (
                  <button
                    className="wa-older"
                    onClick={p.onOlder}
                    disabled={p.loadingMore}
                  >
                    {p.loadingMore ? "讀取中…" : "載入較早訊息"}
                  </button>
                )}
                <div className="wa-history-notice">
                  <ShieldCheck size={12} aria-hidden="true" />
                  訊息時間以香港時間顯示
                </div>
                {p.messages.map((m) => (
                  <article
                    key={m.id}
                    className={`wa-message wa-message-${m.direction}`}
                    aria-label={`${m.direction === "incoming" ? "客戶訊息" : m.direction === "note" ? "內部記錄" : "公司回覆"} ${whatsappTime(m.providerAt ?? m.createdAt, true)}`}
                  >
                    <div className="wa-message-bubble">
                      {m.replyTo && (
                        <div className="wa-message-quote">
                          <Reply size={12} aria-hidden="true" />
                          {p.messages.find((q) => q.id === m.replyTo)?.body ||
                            "已引用訊息"}
                        </div>
                      )}
                      {m.messageType === "text" || m.direction === "note" ? (
                        <p>{m.body}</p>
                      ) : (
                        <div className="wa-unsupported">
                          <MoreHorizontal size={24} aria-hidden="true" />
                          <strong>
                            收到 {m.messageType || "未支援類型"} 訊息
                          </strong>
                          <p>{m.body || "目前未提供附件預覽或播放。"}</p>
                        </div>
                      )}
                      <footer>
                        <span>
                          {m.direction === "outgoing" && m.authorName
                            ? `${m.authorName} · `
                            : ""}
                          {whatsappTime(m.providerAt ?? m.createdAt)}
                        </span>
                        {m.direction === "outgoing" && (
                          <Receipt state={m.state} />
                        )}
                      </footer>
                      {m.direction === "outgoing" &&
                        (m.state === "unknown" ||
                          m.state === "dispatching") && (
                          <small className="wa-message-warning">
                            未能確認送達，請等候狀態更新，避免重複發送。
                          </small>
                        )}
                      {m.direction === "outgoing" && m.state === "failed" && (
                        <small className="wa-message-warning">
                          供應商回報失敗
                          {m.errorCode ? `（${m.errorCode}）` : ""}
                          。核實原因後再跟進。
                        </small>
                      )}
                    </div>
                    {m.direction === "incoming" && p.canSend && (
                      <button
                        className="wa-quote-button"
                        onClick={() => p.onQuote?.(m)}
                        aria-label={`引用訊息：${m.body.slice(0, 35) || m.messageType}`}
                      >
                        <Reply size={15} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
              {!p.atBottom && (
                <button className="wa-latest" onClick={p.onLatest}>
                  <ArrowDown size={14} aria-hidden="true" />
                  最新訊息
                </button>
              )}
              <div className="wa-composer-area">
                {!p.canSend && (
                  <p className="wa-composer-notice">
                    你目前係唯讀角色，可以查看對話及送達狀態。
                  </p>
                )}
                {p.canSend && !connectionReady && (
                  <p className="wa-composer-notice">
                    此號碼嘅連接未完成驗證及真實收訊。請由公司 Owner
                    到連接設定核實狀態。
                  </p>
                )}
                {p.canSend && !windowOpen && (
                  <p className="wa-composer-notice">
                    <Clock3 size={14} aria-hidden="true" />
                    客戶最近 24
                    小時未有傳入訊息。需要已核准嘅訊息範本先可以主動聯絡；此收件箱暫未提供範本發送。
                  </p>
                )}
                {p.quote && (
                  <div className="wa-draft-quote">
                    <Reply size={14} aria-hidden="true" />
                    <span>
                      <strong>回覆客戶訊息</strong>
                      {p.quote.body || p.quote.messageType}
                    </span>
                    <button
                      aria-label="取消引用"
                      className="wa-icon-button"
                      onClick={() => p.onQuote?.(null)}
                      disabled={!!p.pending}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
                {p.pending?.phase === "uncertain" && (
                  <div className="wa-alert" role="alert">
                    <CircleAlert size={16} aria-hidden="true" />
                    <span>
                      傳送結果未能確認。草稿已保留；用同一個發送識別碼核對，避免重複訊息。
                    </span>
                    <button onClick={p.onRetry}>核對傳送結果</button>
                  </div>
                )}
                <div className="wa-composer">
                  <label className="wa-sr-only" htmlFor="wa-draft">
                    回覆客戶
                  </label>
                  <textarea
                    id="wa-draft"
                    value={p.draft}
                    onChange={(e) => p.onDraft?.(e.target.value)}
                    placeholder={
                      disabled
                        ? "目前未能傳送文字回覆"
                        : "寫一個清晰、貼心嘅回覆…"
                    }
                    rows={3}
                    maxLength={8192}
                    aria-describedby="wa-draft-count"
                    disabled={disabled}
                  />
                  <div className="wa-composer-foot">
                    <span id="wa-draft-count">
                      {p.pending?.phase === "sending"
                        ? "正在提交，等候確認…"
                        : "人工回覆"}
                      <i>·</i>
                      {draftLength}/4096
                    </span>
                    <button
                      className="wa-primary"
                      onClick={p.onSend}
                      disabled={
                        disabled || !p.draft.trim() || draftLength > 4096
                      }
                    >
                      <Send size={15} aria-hidden="true" />
                      {p.pending?.phase === "sending" ? "傳送中" : "傳送回覆"}
                    </button>
                  </div>
                </div>
                <p className="wa-delivery-note">
                  提交成功只代表 Meta 接收；送達及已讀以實際回報為準。
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
