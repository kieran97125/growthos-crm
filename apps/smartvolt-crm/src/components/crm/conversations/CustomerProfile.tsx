"use client";
import { useIdentity } from "@/lib/saas/CompanyProvider";
import {
  dateLabel,
  type Action,
  type Booking,
  type Contact,
  type Conversation,
} from "./model";
import { Avatar, IconButton } from "./WorkspacePrimitives";
import { uid, actionTime } from "./events";
import type { Panel } from "./types";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Copy,
  Link2,
  Mail,
  MessageSquare,
  NotebookPen,
  Pencil,
  Pin,
  Plus,
  ShieldCheck,
  Tag,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
export function CustomerProfile({
  selected,
  contact,
  booking,
  dispatch,
  setProfileOpen,
  setPanel,
  setNotice,
  handleStartBooking,
}: {
  selected: Conversation;
  contact: Contact;
  booking?: Booking;
  dispatch: (a: Action) => void;
  setProfileOpen: (v: boolean) => void;
  setPanel: (v: Panel) => void;
  setNotice: (v: string) => void;
  handleStartBooking: () => void;
}) {
  const identity = useIdentity();
  const TEAM = identity.scope.team;

  return (
    <aside className="fh-profile" aria-label="客戶資料">
      <header className="fh-profile-header">
        <h2>客戶資料</h2>
        <div>
          <IconButton
            label={selected.pinned ? "取消置頂" : "置頂對話"}
            active={selected.pinned}
            onClick={() =>
              dispatch({ type: "pin", conversationId: selected.id })
            }
          >
            <Pin size={15} />
          </IconButton>
          <IconButton
            label="收起客戶資料"
            className="fh-close-profile"
            onClick={() => setProfileOpen(false)}
          >
            <X size={17} />
          </IconButton>
        </div>
      </header>
      <div className="fh-profile-scroll">
        <section className="fh-contact-summary">
          <Avatar contact={contact} />
          <h3>{contact.name}</h3>
          <p>
            {contact.company || "個人客戶"}
            <span>·</span>
            <span className="fh-contact-status">
              {contact.tags.includes("VIP 客戶") ? "VIP 客戶" : "新客戶"}
            </span>
          </p>
          <div>
            <span className="fh-id-chip">
              ID · {contact.id.toUpperCase().padStart(4, "0")}
            </span>
            <button onClick={() => setPanel("edit")}>
              <Pencil size={12} />
              編輯資料
            </button>
          </div>
        </section>
        <section className="fh-profile-section">
          <div className="fh-section-title">
            <h3>聯絡資料</h3>
            <IconButton label="編輯聯絡資料" onClick={() => setPanel("edit")}>
              <Pencil size={13} />
            </IconButton>
          </div>
          <div className="fh-contact-field">
            <MessageSquare size={15} />
            <div>
              <small>WhatsApp / 電話</small>
              <span>{contact.phone}</span>
            </div>
            <IconButton
              label="複製示範電話"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(contact.phone);
                  setNotice("已複製示範電話");
                } catch {
                  setNotice("瀏覽器未開放複製權限");
                }
              }}
            >
              <Copy size={12} />
            </IconButton>
          </div>
          <div className="fh-contact-field">
            <Mail size={15} />
            <div>
              <small>電郵地址</small>
              <span className={!contact.email ? "fh-muted" : ""}>
                {contact.email || "未有電郵地址"}
              </span>
            </div>
          </div>
        </section>
        <section className="fh-profile-section">
          <div className="fh-section-title">
            <h3>對話負責人</h3>
          </div>
          <label className="fh-owner-select">
            <span className="fh-mini-avatar">
              {selected.owner ? (
                TEAM.find((t) => t.id === selected.owner)?.initials
              ) : (
                <UserRound size={13} />
              )}
            </span>
            <select
              aria-label="分配負責人"
              value={selected.owner ?? ""}
              onChange={(e) => {
                dispatch({
                  type: "assign",
                  conversationId: selected.id,
                  owner: (e.target.value || null) as Conversation["owner"],
                  at: actionTime(),
                  eventId: uid(),
                });
                setNotice("負責人已更新");
              }}
            >
              <option value="">未分配</option>
              {TEAM.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section className="fh-profile-section">
          <div className="fh-section-title">
            <h3>
              <Tag size={13} />
              客戶標籤
            </h3>
            <IconButton label="管理客戶標籤" onClick={() => setPanel("tags")}>
              <Plus size={15} />
            </IconButton>
          </div>
          <div className="fh-tags">
            {contact.tags.length ? (
              contact.tags.map((t, i) => (
                <span className={`fh-tag fh-tag-${i % 3}`} key={t}>
                  {t}
                  <button
                    aria-label={`移除標籤 ${t}`}
                    onClick={() =>
                      dispatch({
                        type: "contact",
                        contact: {
                          ...contact,
                          tags: contact.tags.filter((x) => x !== t),
                        },
                      })
                    }
                  >
                    <X size={10} />
                  </button>
                </span>
              ))
            ) : (
              <span className="fh-muted">未有標籤</span>
            )}
          </div>
        </section>
        <section className="fh-profile-section">
          <div className="fh-section-title">
            <h3>
              <CalendarDays size={14} />
              預約跟進
            </h3>
            <IconButton label="管理預約" onClick={handleStartBooking}>
              <Plus size={15} />
            </IconButton>
          </div>
          {booking ? (
            <button className="fh-booking-card" onClick={handleStartBooking}>
              <span
                className={`fh-booking-state ${booking.status === "confirmed" ? "is-confirmed" : ""}`}
              >
                <span />
                {booking.status === "confirmed" ? "已確認預約" : "等候同事確認"}
              </span>
              <strong>{booking.service}</strong>
              <span>
                <CalendarDays size={12} />
                {booking.date} · {booking.time}
              </span>
              <span>
                <UsersRound size={12} />
                {booking.guests} 位 · {booking.branch}
              </span>
              <small>
                查看及更新預約
                <ArrowRight size={11} />
              </small>
            </button>
          ) : (
            <button className="fh-add-booking" onClick={handleStartBooking}>
              <Plus size={15} />
              新增預約意向
            </button>
          )}
        </section>
        <section className="fh-profile-section">
          <div className="fh-section-title">
            <h3>
              <NotebookPen size={14} />
              客戶備忘
            </h3>
            <IconButton label="編輯客戶備忘" onClick={() => setPanel("edit")}>
              <Pencil size={13} />
            </IconButton>
          </div>
          <p className="fh-customer-note">
            {contact.note || "加入偏好及長期跟進資料，方便團隊交接。"}
          </p>
        </section>
        <section className="fh-profile-section fh-source">
          <div className="fh-section-title">
            <h3>來源與建立日期</h3>
          </div>
          <p>
            <Link2 size={12} />
            {contact.source}
          </p>
          <p>
            <Clock3 size={12} />
            {dateLabel(contact.createdAt)} 建立
          </p>
        </section>
      </div>
      <footer className="fh-profile-footer">
        <ShieldCheck size={12} />
        獨立示範工作空間
      </footer>
    </aside>
  );
}
