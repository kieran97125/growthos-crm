"use client";
import Link from "next/link";
import { useIdentity } from "@/lib/saas/CompanyProvider";

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Bot,
  Workflow,
  Sparkles,
  PlayCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  ContactRound,
  Flag,
  HelpCircle,
  Inbox,
  Layers3,
  LockKeyhole,
  MessageSquare,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings2,
  Smile,
  UserRound,
  UserRoundPlus,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import {
  QUEUES,
  QUICK_REPLIES,
  createDemoState,
  dateLabel,
  fillReply,
  selectConversations,
  timeLabel,
  type Booking,
  type Conversation,
  type Message,
  type Queue,
} from "./model";
import { useDemoWorkspace } from "./useDemoWorkspace";
import {
  Avatar,
  ChannelIcon,
  IconButton,
  Modal,
  WorkspaceLink,
} from "./WorkspacePrimitives";
import { ConversationList } from "./ConversationList";
import { CustomerProfile } from "./CustomerProfile";
import { WorkspaceDialogs } from "./WorkspaceDialogs";
import { uid, actionTime } from "./events";
import type { Panel, Draft } from "./types";
import { channelNames } from "./model";
import { useStudioStore } from "../studio/useStudioStore";
import { AssistantDialog } from "../studio/AssistantDialog";
import { StudioLoading } from "../studio/StudioUI";
import "./workspace.css";
import "../../pos/pos.css";
import "../studio/studio.css";
import {
  ProductHeader,
  type CustomerContext,
} from "../../products/ProductHeader";
import type { Product } from "@/lib/saas/products";
const FlowStudio = lazy(() => import("../studio/FlowStudio"));
const BotStudio = lazy(() => import("../studio/BotStudio"));
const BroadcastStudio = lazy(() => import("../studio/BroadcastStudio"));
const DemoExperience = lazy(() => import("../studio/DemoExperience"));
export type WorkspaceView =
  "inbox" | "flows" | "bot" | "broadcasts" | "experience" | "pos";

export function ConversationWorkspace({
  mode = "demo",
  initialNow,
  initialView = "inbox",
  initialConversation,
  onSwitchProduct,
  requestedCustomer,
}: {
  mode?: "demo" | "connected-empty";
  initialNow?: number;
  initialView?: WorkspaceView;
  initialContact?: string;
  initialConversation?: string;
  onSwitchProduct: (product: Product, context?: CustomerContext) => void;
  requestedCustomer?: CustomerContext | null;
}) {
  const identity = useIdentity();
  const BRANDS = identity.scope.brands;
  const TEAM = identity.scope.team;

  const { state, dispatch, ready, now, storage } = useDemoWorkspace(
    mode === "demo",
    initialNow,
  );
  const studio = useStudioStore(mode === "demo");
  const [view, setView] = useState<WorkspaceView>(
    mode === "demo" ? initialView : "inbox",
  );
  const [seenCustomer, setSeenCustomer] = useState<string | undefined>();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [queue, setQueue] = useState<Queue>("all");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [channel, setChannel] = useState("all");
  const [selectedId, setSelectedId] = useState(initialConversation ?? "c1");
  const [mobileChat, setMobileChat] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [composerMode, setComposerMode] = useState<"reply" | "note">("reply");
  const [quote, setQuote] = useState<Message | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [bookingDraft, setBookingDraft] = useState<Booking | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToLatest = useRef(true);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const filters = { query, brand, channel, now, actorId: identity.actor.id };
  const rows = selectConversations(state, { ...filters, queue });
  const selected =
    state.conversations.find((c) => c.id === selectedId) ?? rows[0];
  const contact = state.contacts.find((c) => c.id === selected?.contactId);
  if (requestedCustomer?.token && requestedCustomer.token !== seenCustomer) {
    setSeenCustomer(requestedCustomer.token);
    const cv = state.conversations.find(
      (c) =>
        c.contactId === requestedCustomer.contactId &&
        (!requestedCustomer.brandId || c.brandId === requestedCustomer.brandId),
    );
    if (cv) {
      setSelectedId(cv.id);
      setView("inbox");
      setQuery("");
      setBrand("all");
      setChannel("all");
      setQueue("all");
    }
  }
  const messages = state.messages.filter(
    (m) => m.conversationId === selected?.id,
  );
  const booking = state.bookings
    .toReversed()
    .find((b) => b.conversationId === selected?.id && b.status !== "cancelled");
  const draft = selected
    ? (drafts[selected.id] ?? { reply: "", note: "" })
    : { reply: "", note: "" };
  const text = composerMode === "reply" ? draft.reply : draft.note;
  const activeBrand = BRANDS.find((b) => b.id === selected?.brandId);
  const selectedKey = selected?.id;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stickToLatest.current = true;
  }, [selectedKey, messages.length, ready, mobileChat]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !ready) return;
    const onScroll = () => {
      stickToLatest.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 45;
    };
    const resize = new ResizeObserver(() => {
      if (stickToLatest.current) el.scrollTop = el.scrollHeight;
    });
    resize.observe(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      resize.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [ready]);

  function changeDraft(value: string) {
    if (!selected) return;
    setDrafts((current) => ({
      ...current,
      [selected.id]: { ...draft, [composerMode]: value },
    }));
  }
  function openConversation(id: string) {
    setView("inbox");
    setBrand("all");
    setChannel("all");
    setQuery("");
    setQueue("all");
    setSelectedId(id);
    setMobileChat(true);
    setProfileOpen(false);
    setQuote(null);
    setQuickOpen(false);
    setEmojiOpen(false);
    setSnoozeOpen(false);
    setComposerMode("reply");
    dispatch({ type: "read", conversationId: id });
  }
  function changeQueue(value: Queue) {
    setQuote(null);
    setQuickOpen(false);
    setEmojiOpen(false);
    setSnoozeOpen(false);
    setComposerMode("reply");
    setQueue(value);
    setSelectedId("");
    setMobileChat(false);
    setQueueOpen(false);
  }
  function handleStatus(value: Conversation["status"], hours = 1) {
    if (!selected) return;
    const at = actionTime();
    dispatch({
      type: "status",
      conversationId: selected.id,
      status: value,
      at,
      until: at + hours * 3600000,
      eventId: uid(),
    });
    if (value === "resolved") {
      setQueue("resolved");
      setNotice("對話已結束，可以隨時重新開啟");
    } else if (value === "snoozed") {
      setQueue("snoozed");
      setNotice(`已移到稍後跟進，${hours} 小時後回到收件匣`);
    } else {
      setQueue("all");
      setNotice("對話已重新開啟");
    }
    setSnoozeOpen(false);
  }
  function handleSend(e?: FormEvent) {
    e?.preventDefault();
    if (identity.connected && composerMode === "reply") {
      setNotice("通訊渠道尚未接通；草稿已保留，未有傳送。");
      return;
    }
    if (identity.actor.role === "viewer") {
      setNotice("你目前只有檢視權限。");
      return;
    }
    if (!selected || !text.trim() || !ready || selected.status === "resolved")
      return;
    dispatch({
      type: "message",
      conversationId: selected.id,
      message: {
        id: uid(),
        conversationId: selected.id,
        kind: composerMode === "note" ? "note" : "outgoing",
        body: text,
        author: identity.actor.name,
        at: actionTime(),
        replyTo: composerMode === "reply" ? (quote?.id ?? null) : null,
      },
    });
    changeDraft("");
    setQuote(null);
    setQuickOpen(false);
    setEmojiOpen(false);
    setNotice(
      composerMode === "note"
        ? "內部備註已加入，客人不會看見"
        : "示範回覆已加入對話",
    );
  }
  function insertReply(body: string) {
    if (!selected || !contact) return;
    setComposerMode("reply");
    setDrafts((current) => ({
      ...current,
      [selected.id]: {
        ...draft,
        reply: fillReply(body, contact, selected, BRANDS),
      },
    }));
    setQuickOpen(false);
    setPanel(null);
    composerRef.current?.focus();
  }
  function handleStartBooking() {
    if (!selected || !contact) return;
    if (
      identity.products.includes("pos") &&
      booking?.id.startsWith("pos-book-")
    ) {
      setNotice("此預約由 POS 管理，請使用頁頂產品切換入口開啟 POS。");
      return;
    }
    setBookingDraft(
      booking ?? {
        id: uid(),
        conversationId: selected.id,
        contactId: contact.id,
        service: "舒緩護理 · 60 分鐘",
        branch: "中環示範店",
        date: new Date(actionTime() + 86400000).toISOString().slice(0, 10),
        time: "15:00",
        guests: 1,
        customerConfirmed: false,
        status: "pending",
      },
    );
    setPanel("booking");
  }
  function handleSimulateIncoming() {
    if (!selected || !contact) return;
    const customerText = "收到，唔該晒！咁我想了解一下到店前有冇咩需要準備？";
    dispatch({
      type: "message",
      conversationId: selected.id,
      message: {
        id: uid(),
        conversationId: selected.id,
        kind: "incoming",
        body: customerText,
        author: contact.name,
        at: actionTime(),
        replyTo: null,
      },
    });
    setQueue("all");
    setNotice("已模擬一則客戶新訊息");
  }
  function handleReset() {
    setResetOpen(true);
  }
  function resetDemo() {
    setResetOpen(false);
    dispatch({ type: "reset", state: createDemoState(actionTime()) });
    setDrafts({});
    setQueue("all");
    setQuery("");
    setBrand("all");
    setChannel("all");
    setSelectedId("c1");
    setPanel(null);
    setNotice("示範資料已重設");
  }
  function handleOpenContact(c: Conversation) {
    setQueue(
      c.status === "resolved"
        ? "resolved"
        : c.status === "snoozed"
          ? "snoozed"
          : "all",
    );
    setBrand("all");
    setChannel("all");
    setQuery("");
    openConversation(c.id);
    setPanel(null);
  }
  const counts = Object.fromEntries(
    QUEUES.map((q) => [
      q.id,
      selectConversations(state, { ...filters, queue: q.id }).length,
    ]),
  );
  const empty = mode !== "demo";

  return (
    <main
      className={`fh-app ${view !== "inbox" ? "fh-studio-view" : ""} ${mobileChat && view === "inbox" ? "fh-mobile-chat" : ""} ${profileOpen && view === "inbox" ? "fh-profile-open" : ""}`}
    >
      <ProductHeader
        product="crm"
        context={{ contactId: contact?.id, brandId: selected?.brandId }}
        onSwitch={(product) =>
          onSwitchProduct(product, {
            contactId: contact?.id,
            brandId: selected?.brandId,
          })
        }
      />
      <nav className="fh-rail" aria-label="CRM 功能">
        {identity.connected ? (
          <Link
            href={`/company/${identity.scope.companyId}/crm`}
            aria-label="訊息收件匣"
            title="訊息收件匣"
          >
            <Inbox size={21} />
            <span>訊息</span>
          </Link>
        ) : (
          <button
            aria-label="訊息收件匣"
            title="訊息收件匣"
            className={view === "inbox" ? "is-active" : ""}
            onClick={() => {
              setView("inbox");
              setPanel(null);
              setMobileChat(false);
            }}
          >
            <Inbox size={21} />
            <span>訊息</span>
            <i />
          </button>
        )}
        {!empty && (
          <>
            <button
              hidden={identity.connected}
              aria-label="Demo 體驗中心"
              title="Demo 體驗中心"
              className={view === "experience" ? "is-active" : ""}
              onClick={() => {
                setView("experience");
                setProfileOpen(false);
              }}
            >
              <PlayCircle size={21} />
              <span>體驗</span>
            </button>
            <button
              aria-label="推播與成效"
              title="推播與成效"
              className={view === "broadcasts" ? "is-active" : ""}
              onClick={() => {
                setView("broadcasts");
                setProfileOpen(false);
              }}
            >
              <Send size={21} />
              <span>推播</span>
            </button>
            <button
              aria-label="Flow 流程畫布"
              title="Flow 流程畫布"
              className={view === "flows" ? "is-active" : ""}
              onClick={() => {
                setView("flows");
                setProfileOpen(false);
              }}
            >
              <Workflow size={21} />
              <span>Flow</span>
            </button>
            <button
              aria-label="AI BOT 工作室"
              title="AI BOT 工作室"
              className={view === "bot" ? "is-active" : ""}
              onClick={() => {
                setView("bot");
                setProfileOpen(false);
              }}
            >
              <Bot size={21} />
              <span>AI BOT</span>
            </button>
          </>
        )}
        {identity.connected ? (
          <Link
            href={`/company/${identity.scope.companyId}/crm/customers`}
            aria-label="客戶通訊錄"
            title="客戶通訊錄"
          >
            <ContactRound size={21} />
            <span>客戶</span>
          </Link>
        ) : (
          <button
            aria-label="客戶通訊錄"
            title="客戶通訊錄"
            onClick={() => setPanel("contacts")}
          >
            <ContactRound size={21} />
            <span>客戶</span>
          </button>
        )}
        <button
          aria-label="快捷回覆庫"
          title="快捷回覆庫"
          onClick={() => setPanel("replies")}
        >
          <BookOpen size={21} />
          <span>回覆庫</span>
        </button>
        <button
          aria-label="團隊工作量"
          title="團隊工作量"
          onClick={() => setPanel("team")}
        >
          <UsersRound size={21} />
          <span>團隊</span>
        </button>
        <div className="fh-rail-bottom">
          <button
            aria-label="工作空間設定"
            title="工作空間設定"
            onClick={() => setPanel("settings")}
          >
            <Settings2 size={21} />
            <span>設定</span>
          </button>
          <button
            aria-label="示範說明"
            title="示範說明"
            onClick={() => setPanel("guide")}
          >
            <HelpCircle size={21} />
            <span>說明</span>
          </button>
          <span className="fh-rail-dot" />
        </div>
      </nav>
      {view === "inbox" ? (
        <>
          <aside
            className={`fh-queues ${queueOpen ? "is-open" : ""}`}
            aria-label="對話分類"
          >
            <div className="fh-queue-heading">
              <h2>訊息中心</h2>
              <span>WORKSPACE</span>
            </div>
            <label className="fh-brand-select">
              <span className="fh-brand-symbol">
                <Layers3 size={16} />
              </span>
              <select
                aria-label="選擇品牌"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              >
                <option value="all">所有品牌</option>
                {!empty &&
                  BRANDS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="fh-section-label">收件匣</div>
            <div className="fh-queue-list">
              {QUEUES.slice(0, 4).map((q, i) => {
                const Icon = [Inbox, UserRound, UserRoundPlus, Bell][i];
                return (
                  <button
                    key={q.id}
                    className={queue === q.id ? "is-active" : ""}
                    onClick={() => changeQueue(q.id)}
                    aria-pressed={queue === q.id}
                  >
                    <Icon size={16} />
                    <span>{q.name}</span>
                    <b>{empty ? "—" : counts[q.id]}</b>
                  </button>
                );
              })}
            </div>
            <div className="fh-queue-list fh-later-queues">
              {QUEUES.slice(4).map((q, i) => {
                const Icon = i === 0 ? Clock3 : CheckCheck;
                return (
                  <button
                    key={q.id}
                    className={queue === q.id ? "is-active" : ""}
                    onClick={() => changeQueue(q.id)}
                    aria-pressed={queue === q.id}
                  >
                    <Icon size={16} />
                    <span>{q.name}</span>
                    <b>{empty ? "—" : counts[q.id]}</b>
                  </button>
                );
              })}
            </div>
            <div className="fh-section-label fh-channel-label">
              {identity.connected ? "支援渠道" : "通訊渠道"}{" "}
              <span>{empty ? "0" : "3"}</span>
            </div>
            <div className="fh-channel-list">
              {Object.entries(channelNames).map(([key, name]) => (
                <button
                  key={key}
                  className={channel === key ? "is-active" : ""}
                  onClick={() => setChannel(channel === key ? "all" : key)}
                  aria-pressed={channel === key}
                >
                  <ChannelIcon
                    channel={key as Conversation["channel"]}
                    size={13}
                  />
                  <span>{name}</span>
                  <i />
                </button>
              ))}
            </div>
            {!empty && (
              <div className="fh-queue-bottom">
                <div>
                  <span className="fh-presence-dot" />
                  {identity.connected ? "公司成員" : "團隊在線"}
                  <span>{TEAM.length}</span>
                </div>
                <div className="fh-team-stack">
                  {TEAM.slice(0, 3).map((member) => (
                    <span key={member.id} title={member.name}>
                      {member.initials}
                    </span>
                  ))}
                  <button
                    onClick={() => setPanel("team")}
                    aria-label="檢視團隊"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <small>讓每個對話，都有下一步。</small>
              </div>
            )}
          </aside>
          <ConversationList
            queue={queue}
            queueOpen={queueOpen}
            setQueueOpen={setQueueOpen}
            setPanel={setPanel}
            query={query}
            setQuery={setQuery}
            channel={channel}
            setChannel={setChannel}
            ready={ready}
            empty={empty}
            rows={rows}
            selected={selected}
            state={state}
            openConversation={openConversation}
            setBrand={setBrand}
            setQueue={changeQueue}
          />
          {!empty && ready && selected && contact ? (
            <>
              <section
                className="fh-chat"
                aria-label={`與 ${contact.name} 的對話`}
              >
                <header className="fh-chat-header">
                  <IconButton
                    label="返回對話列表"
                    className="fh-mobile-back"
                    onClick={() => setMobileChat(false)}
                  >
                    <ArrowLeft size={20} />
                  </IconButton>
                  <Avatar contact={contact} small />
                  <div className="fh-chat-person">
                    <h2>
                      {contact.name}
                      <span className="fh-chat-vip">
                        {contact.tags.includes("VIP 客戶") ? "VIP" : "客戶"}
                      </span>
                    </h2>
                    <p>
                      <ChannelIcon channel={selected.channel} size={11} />
                      {channelNames[selected.channel]}
                      <span>·</span>
                      {activeBrand?.name}
                    </p>
                  </div>
                  <div className="fh-chat-actions">
                    <IconButton
                      label={
                        selected.priority ? "取消優先處理" : "標記優先處理"
                      }
                      active={selected.priority}
                      onClick={() =>
                        dispatch({
                          type: "priority",
                          conversationId: selected.id,
                        })
                      }
                    >
                      <Flag
                        size={17}
                        fill={selected.priority ? "currentColor" : "none"}
                      />
                    </IconButton>
                    <div className="fh-popover-anchor">
                      <IconButton
                        label="稍後跟進"
                        active={selected.status === "snoozed"}
                        onClick={() => setSnoozeOpen(!snoozeOpen)}
                      >
                        <Clock3 size={18} />
                      </IconButton>
                      {snoozeOpen && (
                        <div className="fh-popover fh-snooze-menu">
                          <strong>幾時再跟進？</strong>
                          {[
                            { n: 1, label: "1 小時後" },
                            { n: 3, label: "3 小時後" },
                            { n: 24, label: "明日同一時間" },
                          ].map((o) => (
                            <button
                              key={o.n}
                              onClick={() => handleStatus("snoozed", o.n)}
                            >
                              <Clock3 size={14} />
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      className={`fh-resolve ${selected.status === "resolved" ? "is-resolved" : ""}`}
                      onClick={() =>
                        handleStatus(
                          selected.status === "resolved" ? "open" : "resolved",
                        )
                      }
                    >
                      {selected.status === "resolved" ? (
                        <RefreshCw size={15} />
                      ) : (
                        <Check size={16} />
                      )}
                      <span>
                        {selected.status === "resolved"
                          ? "重開對話"
                          : "結束對話"}
                      </span>
                    </button>
                    <IconButton
                      label="查看客戶資料"
                      className="fh-profile-toggle"
                      onClick={() => setProfileOpen(!profileOpen)}
                      active={profileOpen}
                    >
                      <ContactRound size={19} />
                    </IconButton>
                  </div>
                </header>
                <div className="fh-conversation-context">
                  <span>
                    <span
                      className={`fh-status-dot fh-status-${selected.status}`}
                    />
                    {selected.status === "resolved"
                      ? "已結束"
                      : selected.status === "snoozed"
                        ? "稍後跟進"
                        : "處理中"}
                    <i />
                    {selected.subject}
                  </span>
                  <button
                    onClick={() => {
                      if (!selected.owner) {
                        dispatch({
                          type: "assign",
                          conversationId: selected.id,
                          owner: identity.actor.id,
                          at: actionTime(),
                          eventId: uid(),
                        });
                        setNotice("你已領取呢個對話");
                      } else setPanel("team");
                    }}
                  >
                    <UserRound size={12} />
                    {selected.owner
                      ? TEAM.find((t) => t.id === selected.owner)?.name
                      : "領取對話"}
                  </button>
                </div>
                <div
                  className="fh-messages"
                  ref={scrollRef}
                  role="log"
                  aria-label="訊息記錄"
                  aria-live="polite"
                >
                  <div className="fh-day-divider">
                    <span>{dateLabel(messages[0]?.at ?? now)} · 香港時間</span>
                  </div>
                  <div className="fh-history-start">
                    <LockKeyhole size={11} />
                    示範對話 · 僅供體驗
                  </div>
                  {messages.map((m) => {
                    if (m.kind === "event")
                      return (
                        <div className="fh-event" key={m.id}>
                          <span />
                          {m.body}
                          <time>{timeLabel(m.at)}</time>
                          <span />
                        </div>
                      );
                    if (m.kind === "note")
                      return (
                        <article className="fh-internal-note" key={m.id}>
                          <header>
                            <LockKeyhole size={12} />
                            <strong>{m.author}</strong>
                            <span>內部備註</span>
                            <time>{timeLabel(m.at)}</time>
                          </header>
                          <p>{m.body}</p>
                        </article>
                      );
                    const original = m.replyTo
                      ? state.messages.find((o) => o.id === m.replyTo)
                      : null;
                    return (
                      <article
                        key={m.id}
                        className={`fh-message fh-message-${m.kind}`}
                      >
                        <div className="fh-message-content">
                          <div className="fh-message-author">
                            {m.kind === "incoming" ? contact.name : m.author}
                          </div>
                          <div className="fh-bubble">
                            {original && (
                              <blockquote>
                                <strong>{original.author}</strong>
                                <p>{original.body}</p>
                              </blockquote>
                            )}
                            <p>{m.body}</p>
                            <button
                              aria-label={`引用訊息：${m.body.slice(0, 18)}`}
                              title="引用回覆"
                              className="fh-quote-action"
                              onClick={() => {
                                setQuote(m);
                                setComposerMode("reply");
                                composerRef.current?.focus();
                              }}
                            >
                              <Reply size={14} />
                            </button>
                          </div>
                          <div className="fh-message-meta">
                            <time>{timeLabel(m.at)}</time>
                            {m.kind === "outgoing" && (
                              <>
                                <CheckCheck size={13} />
                                <span>示範訊息</span>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {selected.status === "resolved" ? (
                  <div className="fh-resolved-composer">
                    <span>
                      <CheckCheck size={18} />
                      呢個對話已結束
                    </span>
                    <button
                      className="fh-button fh-primary"
                      onClick={() => handleStatus("open")}
                    >
                      重新開啟對話
                    </button>
                  </div>
                ) : (
                  <form
                    className={`fh-composer ${composerMode === "note" ? "is-note" : ""}`}
                    onSubmit={handleSend}
                  >
                    <div
                      className="fh-composer-tabs"
                      role="tablist"
                      aria-label="訊息類型"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={composerMode === "reply"}
                        className={composerMode === "reply" ? "is-active" : ""}
                        onClick={() => setComposerMode("reply")}
                      >
                        <Reply size={14} />
                        回覆客戶
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={composerMode === "note"}
                        className={composerMode === "note" ? "is-active" : ""}
                        onClick={() => {
                          setComposerMode("note");
                          setQuickOpen(false);
                        }}
                      >
                        <LockKeyhole size={13} />
                        內部備註
                      </button>
                      <span>
                        {composerMode === "note"
                          ? "只有團隊成員可見"
                          : `透過 ${channelNames[selected.channel]}`}
                      </span>
                    </div>
                    {quote && composerMode === "reply" && (
                      <div className="fh-quote-preview">
                        <Reply size={15} />
                        <div>
                          <strong>回覆 {quote.author}</strong>
                          <p>{quote.body}</p>
                        </div>
                        <IconButton
                          label="取消引用"
                          onClick={() => setQuote(null)}
                        >
                          <X size={14} />
                        </IconButton>
                      </div>
                    )}
                    <textarea
                      ref={composerRef}
                      aria-label={
                        composerMode === "note" ? "內部備註內容" : "回覆訊息"
                      }
                      placeholder={
                        composerMode === "note"
                          ? "加入重點、交接資訊或跟進事項…"
                          : "輸入回覆，或按 ⚡ 選擇快捷回覆…"
                      }
                      value={text}
                      maxLength={5000}
                      onChange={(e) => changeDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter")
                          handleSend();
                      }}
                      rows={3}
                    />
                    <div className="fh-composer-bottom">
                      <div className="fh-composer-tools">
                        <div className="fh-popover-anchor">
                          <IconButton
                            label="插入表情符號"
                            onClick={() => setEmojiOpen(!emojiOpen)}
                          >
                            <Smile size={18} />
                          </IconButton>
                          {emojiOpen && (
                            <div className="fh-popover fh-emoji-picker">
                              {[
                                "😊",
                                "💜",
                                "👍",
                                "🙏",
                                "✨",
                                "🙌",
                                "👋",
                                "📍",
                              ].map((e) => (
                                <button
                                  type="button"
                                  key={e}
                                  aria-label={`插入 ${e}`}
                                  onClick={() => {
                                    changeDraft(text + e);
                                    setEmojiOpen(false);
                                    composerRef.current?.focus();
                                  }}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {composerMode === "reply" && (
                          <div className="fh-popover-anchor">
                            <button
                              type="button"
                              className={`fh-quick-trigger ${quickOpen ? "is-active" : ""}`}
                              onClick={() => setQuickOpen(!quickOpen)}
                              aria-expanded={quickOpen}
                            >
                              <Zap size={16} />
                              快捷回覆
                            </button>
                            {quickOpen && (
                              <div className="fh-popover fh-quick-picker">
                                <header>
                                  <strong>快捷回覆</strong>
                                  <IconButton
                                    label="關閉快捷回覆"
                                    onClick={() => setQuickOpen(false)}
                                  >
                                    <X size={15} />
                                  </IconButton>
                                </header>
                                <div className="fh-search">
                                  <Search size={14} />
                                  <input
                                    aria-label="搜尋快捷回覆"
                                    placeholder="搜尋內容或 /指令"
                                    value={quickSearch}
                                    onChange={(e) =>
                                      setQuickSearch(e.target.value)
                                    }
                                  />
                                </div>
                                {QUICK_REPLIES.filter((r) =>
                                  (r.title + r.shortcut + r.body).includes(
                                    quickSearch,
                                  ),
                                ).map((r) => (
                                  <button
                                    type="button"
                                    key={r.id}
                                    onClick={() => insertReply(r.body)}
                                  >
                                    <span>
                                      {r.title}
                                      <small>{r.shortcut}</small>
                                    </span>
                                    <p>
                                      {fillReply(
                                        r.body,
                                        contact,
                                        selected,
                                        BRANDS,
                                      )}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          className="fh-quick-trigger fh-ai-trigger"
                          aria-label="AI 建議"
                          title="AI 建議"
                          onClick={() => setAssistantOpen(true)}
                        >
                          <Sparkles size={16} />
                          <span>AI 建議</span>
                        </button>
                        <IconButton
                          label="新增預約"
                          onClick={handleStartBooking}
                        >
                          <CalendarDays size={18} />
                        </IconButton>
                      </div>
                      <div className="fh-send-controls">
                        <span>
                          {text.length ? `${text.length}/5000` : "⌘ / Ctrl ↵"}
                        </span>
                        <button
                          className="fh-send"
                          disabled={!text.trim() || !ready}
                          type="submit"
                        >
                          {composerMode === "note" ? "加入備註" : "傳送"}
                          {composerMode === "note" ? (
                            <Plus size={15} />
                          ) : (
                            <Send size={15} />
                          )}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
                <footer className="fh-demo-footer">
                  <span>
                    <span />
                    {storage}
                  </span>
                  <button
                    disabled={identity.connected}
                    onClick={handleSimulateIncoming}
                  >
                    <RefreshCw size={11} />
                    模擬客戶來訊
                  </button>
                  <span>不會發送至真實渠道</span>
                </footer>
              </section>
              {profileOpen && (
                <button
                  className="fh-profile-backdrop"
                  aria-label="收起客戶資料"
                  onClick={() => setProfileOpen(false)}
                />
              )}
              <CustomerProfile
                selected={selected}
                contact={contact}
                booking={booking}
                dispatch={dispatch}
                setProfileOpen={setProfileOpen}
                setPanel={setPanel}
                setNotice={setNotice}
                handleStartBooking={handleStartBooking}
              />
            </>
          ) : (
            <section className="fh-no-conversation">
              <span className="fh-empty-symbol">
                <MessageSquare size={38} />
              </span>
              <h2>
                {empty
                  ? "讓客戶對話，成為工作中心"
                  : "每個對話，都值得好好跟進"}
              </h2>
              <p>
                {empty
                  ? "先連接 WhatsApp 或其他通訊渠道，團隊就可以在同一個工作台回覆客戶。"
                  : "從左邊選擇一個對話，即可查看訊息、回覆客戶及更新資料。"}
              </p>
              {empty ? (
                <div>
                  <WorkspaceLink
                    className="fh-button fh-primary"
                    href="/crm/settings"
                  >
                    設定通訊渠道
                    <ArrowRight size={15} />
                  </WorkspaceLink>
                  <WorkspaceLink className="fh-button" href="/crm/demo">
                    體驗互動示範
                  </WorkspaceLink>
                  <WorkspaceLink className="fh-button" href="/crm/leads">
                    查看 Lead 管理
                  </WorkspaceLink>
                </div>
              ) : (
                <button
                  className="fh-button"
                  onClick={() => {
                    setQuery("");
                    setBrand("all");
                    setChannel("all");
                    setQueue("all");
                  }}
                >
                  返回所有對話
                </button>
              )}
            </section>
          )}
        </>
      ) : ["flows", "bot"].includes(view) &&
        (!studio.state.flows.length || !studio.state.bots.length) ? (
        <section className="fh-no-conversation">
          <h2>產品設定未完成</h2>
          <p>請聯絡公司管理員建立 CRM 工作室設定。</p>
        </section>
      ) : (
        <Suspense fallback={<StudioLoading />}>
          {view === "flows" ? (
            <FlowStudio
              studio={studio}
              onInbox={(id) => {
                if (id) openConversation(id);
                else {
                  setView("inbox");
                  setMobileChat(false);
                }
              }}
            />
          ) : view === "broadcasts" ? (
            <BroadcastStudio
              onInbox={openConversation}
              onExperience={() => setView("experience")}
            />
          ) : view === "experience" && !identity.connected ? (
            <DemoExperience
              onInbox={openConversation}
              onBroadcast={() => setView("broadcasts")}
            />
          ) : (
            <BotStudio
              studio={studio}
              onInbox={() => {
                setView("inbox");
                setMobileChat(false);
              }}
            />
          )}
        </Suspense>
      )}
      {resetOpen && (
        <Modal
          title="重設所有示範資料？"
          subtitle="會清除此瀏覽器嘅推播、成效事件、對話改動、預約、Flow 版本及品牌知識設定，並還原虛構示範資料。"
          onClose={() => setResetOpen(false)}
        >
          <div
            style={{
              padding: 24,
              display: "flex",
              gap: 12,
              justifyContent: "flex-end",
            }}
          >
            <button className="fh-button" onClick={() => setResetOpen(false)}>
              取消
            </button>
            <button className="fh-button fh-primary" onClick={resetDemo}>
              確認重設所有 Demo 資料
            </button>
          </div>
        </Modal>
      )}
      {assistantOpen && selected && contact && (
        <AssistantDialog
          studio={studio}
          contact={contact}
          conversation={selected}
          messages={messages}
          now={now}
          onClose={() => setAssistantOpen(false)}
          onInsert={(text) => {
            insertReply(text);
            setAssistantOpen(false);
          }}
          onFollowUp={() => {
            setAssistantOpen(false);
            handleStartBooking();
          }}
        />
      )}
      {notice && (
        <div className="fh-toast" role="status">
          <Check size={16} />
          {notice}
          <button aria-label="關閉提示" onClick={() => setNotice("")}>
            <X size={13} />
          </button>
        </div>
      )}
      <WorkspaceDialogs
        key={`${panel}-${selected?.id}`}
        panel={panel}
        setPanel={setPanel}
        state={state}
        contact={contact}
        selected={selected}
        bookingDraft={bookingDraft}
        setBookingDraft={setBookingDraft}
        empty={empty}
        storage={storage}
        dispatch={dispatch}
        setNotice={setNotice}
        insertReply={insertReply}
        onReset={handleReset}
        onOpenContact={handleOpenContact}
      />
    </main>
  );
}
