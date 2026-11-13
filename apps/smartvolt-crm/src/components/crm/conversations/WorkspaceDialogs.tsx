"use client";
import { useIdentity } from "@/lib/saas/CompanyProvider";
import { BRAND } from "@/lib/brand";
import { useState } from "react";
import {
  QUICK_REPLIES,
  type Action,
  type Booking,
  type Contact,
  type Conversation,
  type DemoState,
} from "./model";
import { Avatar, Modal } from "./WorkspacePrimitives";
import { uid, actionTime } from "./events";
import type { Panel } from "./types";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
export function WorkspaceDialogs({
  panel,
  setPanel,
  state,
  contact,
  selected,
  bookingDraft,
  setBookingDraft,
  empty,
  storage,
  dispatch,
  setNotice,
  onReset,
  insertReply,
  onOpenContact,
}: {
  panel: Panel;
  setPanel: (v: Panel) => void;
  state: DemoState;
  contact?: Contact;
  selected?: Conversation;
  bookingDraft: Booking | null;
  setBookingDraft: (v: Booking) => void;
  empty: boolean;
  storage: string;
  dispatch: (a: Action) => void;
  setNotice: (v: string) => void;
  onReset: () => void;
  insertReply: (body: string) => void;
  onOpenContact: (c: Conversation) => void;
}) {
  const identity = useIdentity();
  const TEAM = identity.scope.team;

  const [contactSearch, setContactSearch] = useState("");
  const [newTag, setNewTag] = useState("");
  return (
    <>
      {" "}
      {panel === "guide" && (
        <Modal
          title="由一個對話開始試用"
          subtitle={`${BRAND.name} · 客戶對話工作台`}
          onClose={() => setPanel(null)}
        >
          <div className="fh-guide">
            <div className="fh-guide-hero">
              <span>
                <MessageSquare size={26} />
              </span>
              <div>
                <strong>一邊覆客，一邊完成跟進。</strong>
                <p>訊息、客戶背景同下一步，都喺同一個畫面。</p>
              </div>
            </div>
            {[
              {
                n: "01",
                title: "像平日一樣回覆",
                body: "揀一個對話，輸入訊息再按傳送。用快捷回覆帶入客人名稱，亦可以引用某句訊息。",
              },
              {
                n: "02",
                title: "交接資訊留喺內部",
                body: "切換「內部備註」記低重點，再喺右邊分配負責人、加標籤或整理客戶備忘。",
              },
              {
                n: "03",
                title: "安排下一步",
                body: "新增預約意向、稍後跟進，或者結束對話。按「模擬客戶來訊」可以試收訊息。",
              },
              {
                n: "04",
                title: "設計同試跑 Flow",
                body: "左邊按 Flow，可拖拉節點、改分支、配對範本參數。試跑會停喺 CS 核實，剔選測試條件後先預覽提醒。",
              },
              {
                n: "05",
                title: "推播同成效",
                body: "按推播建立活動、篩選有同意嘅名單、預覽參數。試發後可用體驗中心回覆，再追到核實預約同到店事件。",
              },
              {
                n: "06",
                title: "試用 BOT 同 AI 建議",
                body: "按 AI BOT 設定品牌知識及回覆模式，右邊試聊同轉真人。對話中按 AI 建議，可以準備草稿再自行修改。",
              },
            ].map((s) => (
              <article key={s.n}>
                <b>{s.n}</b>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </article>
            ))}
            <div className="fh-info-box">
              <ShieldCheck size={17} />
              <p>
                所有客戶及對話均為虛構。操作只保留於此瀏覽器；Demo 未連接真實
                WhatsApp、Instagram 或公司資料。真實 AI 需用專用體驗碼啟用。
              </p>
            </div>
            <button
              className="fh-button fh-primary fh-full"
              onClick={() => setPanel(null)}
            >
              開始體驗
              <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
      {panel === "edit" && contact && (
        <Modal
          title="編輯客戶資料"
          subtitle="更新客戶背景，方便下次跟進。"
          onClose={() => setPanel(null)}
        >
          <form
            className="fh-form"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const name = String(data.get("name")).trim();
              if (!name) return;
              dispatch({
                type: "contact",
                contact: {
                  ...contact,
                  name,
                  initials: /^[\x00-\x7F]+$/.test(name)
                    ? name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()
                    : name.slice(-1),
                  email: String(data.get("email")).trim(),
                  company: String(data.get("company")).trim(),
                  note: String(data.get("note")).trim(),
                },
              });
              setPanel(null);
              setNotice("客戶資料已更新");
            }}
          >
            <label>
              客戶名稱
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={contact.name}
              />
            </label>
            <label>
              電郵地址
              <input
                type="email"
                name="email"
                maxLength={160}
                placeholder="name@example.com"
                defaultValue={contact.email}
              />
            </label>
            <label>
              公司 / 機構
              <input
                name="company"
                maxLength={100}
                placeholder="選填"
                defaultValue={contact.company}
              />
            </label>
            <label>
              客戶備忘
              <textarea
                name="note"
                rows={4}
                maxLength={1000}
                placeholder="客戶偏好、到店習慣、交接重點…"
                defaultValue={contact.note}
              />
            </label>
            <footer>
              <button
                className="fh-button"
                type="button"
                onClick={() => setPanel(null)}
              >
                取消
              </button>
              <button className="fh-button fh-primary" type="submit">
                儲存資料
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {panel === "tags" && contact && (
        <Modal
          title="管理客戶標籤"
          subtitle={`為 ${contact.name} 整理跟進分類。`}
          onClose={() => setPanel(null)}
        >
          <div className="fh-tag-manager">
            <div className="fh-tags">
              {[
                ...new Set([
                  "新客查詢",
                  "首次體驗",
                  "VIP 客戶",
                  "雙人同行",
                  "企業客戶",
                  "待報價",
                  ...contact.tags,
                ]),
              ].map((t) => (
                <button
                  key={t}
                  className={`fh-tag-option ${contact.tags.includes(t) ? "is-active" : ""}`}
                  onClick={() =>
                    dispatch({
                      type: "contact",
                      contact: {
                        ...contact,
                        tags: contact.tags.includes(t)
                          ? contact.tags.filter((x) => x !== t)
                          : [...contact.tags, t].slice(0, 20),
                      },
                    })
                  }
                >
                  {contact.tags.includes(t) ? (
                    <Check size={13} />
                  ) : (
                    <Plus size={13} />
                  )}
                  {t}
                </button>
              ))}
            </div>
            <form
              className="fh-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const value = newTag.trim();
                if (
                  !value ||
                  contact.tags.includes(value) ||
                  contact.tags.length >= 20
                )
                  return;
                dispatch({
                  type: "contact",
                  contact: { ...contact, tags: [...contact.tags, value] },
                });
                setNewTag("");
              }}
            >
              <input
                aria-label="新標籤名稱"
                maxLength={30}
                placeholder="新增自訂標籤"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
              />
              <button
                className="fh-button fh-primary"
                disabled={!newTag.trim()}
              >
                新增
              </button>
            </form>
            <button
              className="fh-button fh-primary fh-full"
              onClick={() => setPanel(null)}
            >
              完成
            </button>
          </div>
        </Modal>
      )}
      {panel === "booking" && bookingDraft && (
        <Modal
          title="預約跟進"
          subtitle="客戶意向與正式確認分開記錄。"
          onClose={() => setPanel(null)}
        >
          <form
            className="fh-form"
            onSubmit={(e) => {
              e.preventDefault();
              dispatch({
                type: "booking",
                booking: bookingDraft,
                at: actionTime(),
                eventId: uid(),
              });
              setPanel(null);
              setNotice("預約記錄已儲存");
            }}
          >
            <label>
              服務項目
              <input
                required
                maxLength={100}
                value={bookingDraft.service}
                onChange={(e) =>
                  setBookingDraft({ ...bookingDraft, service: e.target.value })
                }
              />
            </label>
            <div className="fh-form-grid">
              <label>
                日期
                <input
                  type="date"
                  required
                  value={bookingDraft.date}
                  onChange={(e) =>
                    setBookingDraft({ ...bookingDraft, date: e.target.value })
                  }
                />
              </label>
              <label>
                時間
                <input
                  type="time"
                  required
                  value={bookingDraft.time}
                  onChange={(e) =>
                    setBookingDraft({ ...bookingDraft, time: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="fh-form-grid">
              <label>
                示範分店
                <select
                  value={bookingDraft.branch}
                  onChange={(e) =>
                    setBookingDraft({ ...bookingDraft, branch: e.target.value })
                  }
                >
                  <option>中環示範店</option>
                  <option>九龍示範店</option>
                </select>
              </label>
              <label>
                到店人數
                <input
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={bookingDraft.guests}
                  onChange={(e) =>
                    setBookingDraft({
                      ...bookingDraft,
                      guests: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label className="fh-checkbox">
              <input
                type="checkbox"
                checked={bookingDraft.customerConfirmed}
                onChange={(e) =>
                  setBookingDraft({
                    ...bookingDraft,
                    customerConfirmed: e.target.checked,
                  })
                }
              />
              <span>客戶已表示接受此安排</span>
            </label>
            <label>
              預約狀態
              <select
                value={bookingDraft.status}
                onChange={(e) =>
                  setBookingDraft({
                    ...bookingDraft,
                    status: e.target.value as Booking["status"],
                  })
                }
              >
                <option value="pending">等候同事確認</option>
                <option value="confirmed">同事已確認預約</option>
                <option value="cancelled">已取消</option>
              </select>
            </label>
            <div className="fh-info-box">
              <CalendarDays size={16} />
              <p>
                示範預約不會佔用真實名額。客戶表示接受後，仍需由同事確認可用時段。
              </p>
            </div>
            <footer>
              <button
                className="fh-button"
                type="button"
                onClick={() => setPanel(null)}
              >
                取消
              </button>
              <button className="fh-button fh-primary">儲存預約</button>
            </footer>
          </form>
        </Modal>
      )}
      {panel === "contacts" && (
        <Modal
          title="客戶通訊錄"
          subtitle={`${empty ? "0" : state.contacts.length} 位示範客戶 · 對話與客戶記錄分開保留`}
          wide
          onClose={() => setPanel(null)}
        >
          <div className="fh-contacts-panel">
            <div className="fh-search">
              <Search size={16} />
              <input
                aria-label="搜尋客戶通訊錄"
                placeholder="搜尋名稱、電話或標籤"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
              />
            </div>
            <div className="fh-contact-table">
              {!empty &&
                state.contacts
                  .filter((p) =>
                    [p.name, p.phone, ...p.tags]
                      .join(" ")
                      .toLowerCase()
                      .includes(contactSearch.toLowerCase()),
                  )
                  .map((p) => {
                    const c = state.conversations.find(
                      (c) => c.contactId === p.id,
                    )!;
                    return (
                      <button key={p.id} onClick={() => onOpenContact(c)}>
                        <Avatar contact={p} small />
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.phone}</small>
                        </span>
                        <span className="fh-contact-table-tags">
                          {p.tags.map((t) => (
                            <span className="fh-tag" key={t}>
                              {t}
                            </span>
                          ))}
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    );
                  })}
            </div>
          </div>
        </Modal>
      )}
      {panel === "replies" && (
        <Modal
          title="快捷回覆庫"
          subtitle="預先整理常用內容，插入後仍可自由修改。"
          wide
          onClose={() => setPanel(null)}
        >
          <div className="fh-reply-library">
            {QUICK_REPLIES.map((r) => (
              <article key={r.id}>
                <div>
                  <h3>{r.title}</h3>
                  <code>{r.shortcut}</code>
                </div>
                <p>{r.body}</p>
                <button
                  className="fh-button"
                  disabled={!selected || empty}
                  onClick={() => insertReply(r.body)}
                >
                  插入目前對話
                  <ArrowRight size={14} />
                </button>
              </article>
            ))}
          </div>
        </Modal>
      )}
      {panel === "team" && (
        <Modal
          title="團隊工作量"
          subtitle="按目前未結束對話計算，分配後即時更新。"
          onClose={() => setPanel(null)}
        >
          <div className="fh-team-panel">
            {TEAM.map((t) => {
              const count = empty
                ? 0
                : state.conversations.filter(
                    (c) => c.owner === t.id && c.status !== "resolved",
                  ).length;
              return (
                <article key={t.id}>
                  <span className="fh-team-person">
                    {t.initials}
                    <i />
                  </span>
                  <div>
                    <strong>{t.name}</strong>
                    <p>客服顧問 · 在線</p>
                  </div>
                  <b>
                    {count}
                    <small>跟進中</small>
                  </b>
                  {selected && !empty && (
                    <button
                      className="fh-button"
                      disabled={selected.owner === t.id}
                      onClick={() => {
                        dispatch({
                          type: "assign",
                          conversationId: selected.id,
                          owner: t.id,
                          at: actionTime(),
                          eventId: uid(),
                        });
                        setNotice(`已分配予 ${t.name}`);
                      }}
                    >
                      {selected.owner === t.id ? "已分配" : "分配此對話"}
                    </button>
                  )}
                </article>
              );
            })}
            <div className="fh-info-box">
              <UsersRound size={17} />
              <p>
                Demo
                展示分配及工作量變動；正式版本可按公司團隊、角色及品牌權限設定。
              </p>
            </div>
          </div>
        </Modal>
      )}
      {panel === "settings" && (
        <Modal
          title="工作空間設定"
          subtitle={
            identity.connected
              ? `${BRAND.name} · 公司工作空間`
              : `${BRAND.name} · 獨立示範環境`
          }
          onClose={() => setPanel(null)}
        >
          <div className="fh-settings">
            <div className="fh-setting-row">
              <span>
                <strong>工作空間</strong>
                <small>
                  {identity.connected
                    ? "此公司專屬資料與權限"
                    : "虛構公司及品牌"}
                </small>
              </span>
              <b>{identity.scope.companyName}</b>
            </div>
            <div className="fh-setting-row">
              <span>
                <strong>時區</strong>
                <small>所有訊息以香港時間顯示</small>
              </span>
              <b>香港 · UTC+8</b>
            </div>
            <div className="fh-setting-row">
              <span>
                <strong>真實通訊渠道</strong>
                <small>不會向任何客戶發送訊息</small>
              </span>
              <span className="fh-neutral-chip">未連接</span>
            </div>
            <div className="fh-setting-row">
              <span>
                <strong>{identity.connected ? "資料儲存" : "示範資料"}</strong>
                <small>{storage}</small>
              </span>
              <span className="fh-neutral-chip">
                {identity.connected ? "公司資料庫" : "瀏覽器本機"}
              </span>
            </div>
            <div className="fh-info-box">
              <ShieldCheck size={17} />
              <p>
                {identity.connected
                  ? "公司工作空間獨立管理。通訊渠道及 AI 啟用進度可於公司設定查看。"
                  : "本示範使用虛構資料，沒有連接任何客戶正式系統。"}
              </p>
            </div>
            <button
              className="fh-button fh-reset"
              disabled={identity.connected}
              onClick={onReset}
            >
              <RefreshCw size={14} />
              重設示範資料
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
