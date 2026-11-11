"use client";
import { useIdentity } from "@/lib/saas/CompanyProvider";
import {
  QUEUES,
  channelNames,
  timeLabel,
  type Conversation,
  type DemoState,
  type Queue,
} from "./model";
import { Avatar, ChannelIcon, IconButton } from "./WorkspacePrimitives";
import type { Panel } from "./types";
import {
  ArrowDown,
  ChevronDown,
  Ellipsis,
  Inbox,
  Pin,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
export function ConversationList({
  queue,
  queueOpen,
  setQueueOpen,
  setPanel,
  query,
  setQuery,
  channel,
  setChannel,
  ready,
  empty,
  rows,
  selected,
  state,
  openConversation,
  setBrand,
  setQueue,
}: {
  queue: Queue;
  queueOpen: boolean;
  setQueueOpen: (v: boolean) => void;
  setPanel: (v: Panel) => void;
  query: string;
  setQuery: (v: string) => void;
  channel: string;
  setChannel: (v: string) => void;
  ready: boolean;
  empty: boolean;
  rows: Conversation[];
  selected?: Conversation;
  state: DemoState;
  openConversation: (id: string) => void;
  setBrand: (v: string) => void;
  setQueue: (v: Queue) => void;
}) {
  const identity = useIdentity();
  const BRANDS = identity.scope.brands;
  const TEAM = identity.scope.team;

  return (
    <section className="fh-conversations" aria-label="對話列表">
      <div className="fh-list-heading">
        <h1>
          {QUEUES.find((q) => q.id === queue)?.name}
          <span>{empty ? "0" : rows.length}</span>
        </h1>
        <IconButton
          label="選擇對話分類"
          className="fh-queue-toggle"
          onClick={() => setQueueOpen(!queueOpen)}
        >
          <Settings2 size={17} />
        </IconButton>
        <IconButton label="試用操作說明" onClick={() => setPanel("guide")}>
          <Ellipsis size={21} />
        </IconButton>
      </div>
      <div className="fh-search">
        <Search size={16} />
        <input
          type="search"
          aria-label="搜尋對話"
          placeholder="搜尋客戶或對話內容"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <IconButton label="清除搜尋" onClick={() => setQuery("")}>
            <X size={13} />
          </IconButton>
        )}
      </div>
      <div className="fh-list-toolbar">
        <span>
          最近更新 <ArrowDown size={12} />
        </span>
        <label>
          <select
            aria-label="對話渠道篩選"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="all">所有渠道</option>
            {Object.entries(channelNames).map(([key, name]) => (
              <option value={key} key={key}>
                {name}
              </option>
            ))}
          </select>
          <ChevronDown size={12} />
        </label>
      </div>
      <div className="fh-conversation-scroll">
        {!ready && !empty ? (
          <div className="fh-loading">正在開啟工作空間…</div>
        ) : empty ? (
          <div className="fh-list-empty">
            <Inbox size={28} />
            <strong>準備接收第一個對話</strong>
            <p>連接通訊渠道後，客戶訊息會出現在這裏。</p>
          </div>
        ) : rows.length ? (
          rows.map((c) => {
            const person = state.contacts.find((p) => p.id === c.contactId)!;
            const last = [...state.messages]
              .reverse()
              .find(
                (m) =>
                  m.conversationId === c.id &&
                  (m.kind === "incoming" || m.kind === "outgoing"),
              );
            return (
              <button
                className={`fh-conversation-row ${selected?.id === c.id ? "is-selected" : ""} ${c.unread ? "is-unread" : ""}`}
                key={c.id}
                onClick={() => openConversation(c.id)}
                aria-label={`開啟 ${person.name} 對話`}
                aria-current={selected?.id === c.id ? "true" : undefined}
              >
                <span className="fh-row-avatar">
                  <Avatar contact={person} />
                  <ChannelIcon channel={c.channel} />
                </span>
                <span className="fh-row-content">
                  <span className="fh-row-top">
                    <strong>{person.name}</strong>
                    <time>{timeLabel(c.updatedAt)}</time>
                  </span>
                  <span className="fh-row-preview">
                    {last?.kind === "outgoing" ? "你：" : ""}
                    {last?.body}
                  </span>
                  <span className="fh-row-meta">
                    <span className="fh-brand-pill">
                      {BRANDS.find((b) => b.id === c.brandId)?.name}
                    </span>
                    {c.priority && (
                      <span className="fh-priority-small">
                        <span />
                        優先
                      </span>
                    )}
                    <span className="fh-row-owner">
                      {c.owner ? (
                        TEAM.find((t) => t.id === c.owner)?.initials
                      ) : (
                        <UserRound size={10} />
                      )}
                    </span>
                    {c.unread > 0 ? (
                      <span className="fh-unread-count">{c.unread}</span>
                    ) : c.pinned ? (
                      <Pin size={11} />
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })
        ) : (
          <div className="fh-list-empty">
            <Search size={26} />
            <strong>未有符合嘅對話</strong>
            <p>可以切換分類，或調整搜尋條件。</p>
            <button
              onClick={() => {
                setQuery("");
                setChannel("all");
                setBrand("all");
                setQueue("all");
              }}
            >
              重設篩選
            </button>
          </div>
        )}
      </div>
      <footer className="fh-list-footer">
        <ShieldCheck size={12} />
        <span>{empty ? "獨立 CRM 工作空間" : "全部為虛構示範客戶"}</span>
      </footer>
    </section>
  );
}
