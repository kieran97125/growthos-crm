"use client";
import { useIdentity } from "@/lib/saas/CompanyProvider";
import { useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  Download,
  FileUp,
  MessageSquare,
  Plus,
  Send,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Papa from "papaparse";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { useDemo } from "@/lib/demo/Provider";
import { BRAND } from "@/lib/brand";
import {
  audience,
  metrics,
  recipientStatus,
  recipientEvents,
  statusLabels,
  type Campaign,
} from "@/lib/demo/campaigns";

import { Modal } from "../conversations/WorkspacePrimitives";
import { uid, actionTime } from "../conversations/events";
import "./broadcast.css";
const date = (at: number) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
export default function BroadcastStudio({
  onInbox,
  onExperience,
}: {
  onInbox: (id: string) => void;
  onExperience: () => void;
}) {
  const identity = useIdentity();
  const BRANDS = identity.scope.brands;

  const d = useDemo(),
    b = d.state.broadcasts;
  const [brand, setBrand] = useState<Campaign["brandId"]>(BRANDS[0].id),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState<"edit" | "report" | "contacts">("edit"),
    [confirm, setConfirm] = useState(false),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const campaigns = b.campaigns.filter((c) => c.brandId === brand),
    c = campaigns.find((c) => c.id === selected) ?? campaigns.at(-1),
    rows = c ? audience(d.state.inbox, b, c, d.now) : [],
    eligible = rows.filter((r) => !r.reasons.length),
    recipients = b.recipients.filter((r) => r.campaignId === c?.id),
    m = c ? metrics(b, c.id) : null;
  function add() {
    const t = b.templates.find((t) => t.brandId === brand && t.approved);
    if (!t) {
      setNotice("此品牌未有已核准範本；請先完成通訊渠道及範本設定。");
      return;
    }
    const campaign: Campaign = {
      id: uid(),
      brandId: brand,
      name: `${BRANDS.find((b) => b.id === brand)?.name} 服務推播 ${campaigns.length + 1}`,
      templateId: t.id,
      templateRevision: t.revision,
      templateBody: t.body,
      segment: "all",
      tag: "",
      fields: {
        service: identity.connected
          ? ""
          : brand === "nova-studio"
            ? "舒緩護理"
            : "肩頸舒緩",
        fee: identity.connected
          ? ""
          : brand === "nova-studio"
            ? "HK$480"
            : "HK$620",
        branch: identity.connected ? "" : "中環示範店",
        date: "",
        time: "",
      },
      status: "draft",
      createdAt: actionTime(),
      launchedAt: null,
    };
    d.dispatch({ type: "campaign-save", campaign });
    setSelected(campaign.id);
    setTab("edit");
  }
  function patch(v: Partial<Campaign>) {
    if (c && !c.launchedAt)
      d.dispatch({ type: "campaign-save", campaign: { ...c, ...v } });
  }
  function experience(id: string) {
    d.dispatch({ type: "active-recipient", id });
    onExperience();
  }
  function csv() {
    if (!c) return;
    const safe = (v: string) => (/^[=+@-]/.test(v) ? "'" + v : v);
    const text = Papa.unparse(
      recipients.map((r) => {
        const p = d.state.inbox.contacts.find((p) => p.id === r.contactId)!;
        return {
          campaign: c.name,
          name: safe(p.name),
          phone: safe(p.phone),
          status: statusLabels[recipientStatus(b, r)],
          sent_hkt: date(r.sentAt),
          booking_id: r.bookingId ?? "",
          events: recipientEvents(b, r)
            .map((e) => `${e.kind}@${date(e.at)}[${e.source}]`)
            .join(" | "),
        };
      }),
      { escapeFormulae: true },
    );
    const url = URL.createObjectURL(
        new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8;" }),
      ),
      link = document.createElement("a");
    link.href = url;
    link.download = BRAND.auditFilename;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function importFile(file: File) {
    if (file.size > 1000000) {
      setNotice("CSV 請少於 1MB，每次最多匯入 50 位。");
      return;
    }
    const parsed = Papa.parse<Record<string, string>>(await file.text(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) =>
        h
          .trim()
          .toLowerCase()
          .replace(/^\ufeff/, ""),
    });
    if (parsed.errors.length) {
      setNotice("CSV 格式有問題，請使用 name、phone 欄位。");
      return;
    }
    const cleaned = parsed.data.slice(0, 50).flatMap((row) => {
      const pn = parsePhoneNumberFromString((row.phone ?? "").trim(), "HK");
      return row.name?.trim() && pn?.isValid()
        ? [{ name: row.name.trim(), phone: pn.number }]
        : [];
    });
    d.dispatch({
      type: "import",
      brandId: brand,
      rows: cleaned,
      at: actionTime(),
    });
    setNotice(
      `已處理 ${cleaned.length} 列有效資料；重複電話會跳過，匯入不會自動授予同意。`,
    );
    setTab("contacts");
  }
  return (
    <section className="bc-workspace st-workspace" aria-label="推播工作室">
      <header className="bc-header">
        <div>
          <span className="bc-eyebrow">BROADCAST & ATTRIBUTION</span>
          <h1>
            推播工作室 <span>每個回覆，都追得到。</span>
          </h1>
        </div>
        <div>
          <span className="bc-test">
            <ShieldCheck size={14} />
            測試渠道
          </span>
          <button
            className="bc-button bc-primary"
            onClick={add}
            disabled={campaigns.length >= 30}
          >
            <Plus size={15} />
            新增推播
          </button>
        </div>
      </header>
      <aside className="bc-sidebar">
        <label>
          品牌
          <select
            aria-label="推播品牌"
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value as typeof brand);
              setSelected("");
            }}
          >
            {BRANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <h2>
          我的推播 <span>{campaigns.length}</span>
        </h2>
        <div className="bc-campaign-list">
          {campaigns.map((row) => (
            <button
              key={row.id}
              className={row.id === c?.id ? "is-active" : ""}
              onClick={() => {
                setSelected(row.id);
                setTab(row.launchedAt ? "report" : "edit");
              }}
            >
              <Send size={16} />
              <span>
                <strong>{row.name}</strong>
                <small>
                  {row.launchedAt ? "已完成示範發送" : "草稿"} ·{" "}
                  {date(row.createdAt)}
                </small>
              </span>
            </button>
          ))}
          {!campaigns.length && <p>建立第一個推播，準備範本同受眾名單。</p>}
        </div>
        <div className="bc-boundary">
          <ShieldCheck size={18} />
          <strong>獨立 Demo 空間</strong>
          <p>資料只存於此瀏覽器。未接 WhatsApp、Supabase 或任何公司資料。</p>
        </div>
      </aside>
      <div className="bc-main">
        <nav className="bc-tabs" aria-label="推播頁籤">
          <button aria-pressed={tab === "edit"} onClick={() => setTab("edit")}>
            <MessageSquare size={15} />
            內容與名單
          </button>
          <button
            aria-pressed={tab === "report"}
            onClick={() => setTab("report")}
          >
            <BarChart3 size={15} />
            推播成效
          </button>
          <button
            aria-pressed={tab === "contacts"}
            onClick={() => setTab("contacts")}
          >
            <Users size={15} />
            聯絡與同意
          </button>
        </nav>
        <div className="bc-scroll">
          {tab === "contacts" ? (
            <>
              <div className="bc-section-heading">
                <div>
                  <h2>品牌聯絡名單</h2>
                  <p>電話匯入同聯絡同意分開處理，退訂優先。</p>
                </div>
                <button
                  className="bc-button"
                  onClick={() => upload.current?.click()}
                >
                  <FileUp size={15} />
                  匯入 CSV
                </button>
              </div>
              <input
                ref={upload}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = "";
                }}
              />
              <p className="bc-note">
                欄位使用 name、phone；電話按國際格式或香港格式核實。每次最多 50
                列，同品牌重複電話會跳過。以下同意只供 Demo，並非正式發送證據。
              </p>
              <div className="bc-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>客戶</th>
                      <th>類型</th>
                      <th>同意狀態</th>
                      <th>示範操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.profiles
                      .filter((p) => p.brandId === brand)
                      .map((p) => {
                        const person = d.state.inbox.contacts.find(
                          (c) => c.id === p.contactId,
                        );
                        return (
                          person && (
                            <tr key={p.contactId}>
                              <td>
                                <strong>{person.name}</strong>
                                <small>{person.phone}</small>
                              </td>
                              <td>
                                {p.customerType === "new" ? "新客" : "現客"}
                              </td>
                              <td>
                                <span
                                  className={`bc-badge ${p.consent === "granted" && !p.suppressed ? "is-good" : "is-warn"}`}
                                >
                                  {p.suppressed
                                    ? "已停止聯絡"
                                    : p.consent === "granted"
                                      ? "示範同意"
                                      : "未有同意"}
                                </span>
                                <small>
                                  {p.consentSource || "沒有證據來源"}
                                </small>
                              </td>
                              <td>
                                <button
                                  className="bc-text-button"
                                  onClick={() =>
                                    d.dispatch({
                                      type: "consent",
                                      contactId: p.contactId,
                                      brandId: brand,
                                      granted: p.consent !== "granted",
                                      at: actionTime(),
                                    })
                                  }
                                >
                                  {p.consent === "granted"
                                    ? "撤回示範同意"
                                    : "授予示範同意"}
                                </button>
                              </td>
                            </tr>
                          )
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          ) : !c ? (
            <div className="bc-welcome">
              <span>
                <Send size={30} />
              </span>
              <h2>由一個有依據嘅推播開始。</h2>
              <p>選擇品牌範本、檢查名單，再體驗回覆點樣變成預約跟進。</p>
              <div className="bc-journey">
                <span>01 範本與受眾</span>
                <ArrowRight size={16} />
                <span>02 發送前檢查</span>
                <ArrowRight size={16} />
                <span>03 回覆與成效</span>
              </div>
              <button className="bc-button bc-primary" onClick={add}>
                <Plus size={16} />
                建立第一個推播
              </button>
            </div>
          ) : tab === "edit" ? (
            <>
              <div className="bc-section-heading">
                <div>
                  <h2>{c.name}</h2>
                  <p>
                    {c.launchedAt
                      ? "已發送嘅內容及實際收件人名單會保留，新增推播可重新選擇條件。"
                      : "先檢查對象同範本，符合條件先可以開始。"}
                  </p>
                </div>
                {c.launchedAt ? (
                  <button
                    className="bc-button"
                    onClick={() => setTab("report")}
                  >
                    查看成效
                    <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    className="bc-button bc-primary"
                    disabled={!eligible.length}
                    onClick={() => setConfirm(true)}
                  >
                    <Send size={14} />
                    開始示範推播 · {eligible.length}
                  </button>
                )}
              </div>
              <div className="bc-compose-grid">
                <div className="bc-card bc-fields">
                  <label>
                    推播名稱
                    <input
                      aria-label="推播名稱"
                      value={c.name}
                      disabled={!!c.launchedAt}
                      maxLength={100}
                      onChange={(e) => {
                        if (e.target.value.trim())
                          patch({ name: e.target.value });
                      }}
                    />
                  </label>
                  <div className="bc-two">
                    <label>
                      客戶分組
                      <select
                        aria-label="推播客戶分組"
                        value={c.segment}
                        disabled={!!c.launchedAt}
                        onChange={(e) =>
                          patch({
                            segment: e.target.value as Campaign["segment"],
                          })
                        }
                      >
                        <option value="all">新客 + 現客</option>
                        <option value="new">新客</option>
                        <option value="existing">現客</option>
                      </select>
                    </label>
                    <label>
                      標籤
                      <select
                        aria-label="推播標籤"
                        value={c.tag}
                        disabled={!!c.launchedAt}
                        onChange={(e) => patch({ tag: e.target.value })}
                      >
                        <option value="">所有標籤</option>
                        {[
                          ...new Set(
                            d.state.inbox.contacts.flatMap((p) => p.tags),
                          ),
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    品牌範本
                    <select
                      aria-label="推播範本"
                      value={c.templateId}
                      disabled={!!c.launchedAt}
                      onChange={(e) => {
                        const t = b.templates.find(
                          (t) => t.id === e.target.value,
                        )!;
                        patch({
                          templateId: t.id,
                          templateRevision: t.revision,
                          templateBody: t.body,
                        });
                      }}
                    >
                      {b.templates
                        .filter((t) => t.brandId === brand)
                        .map((t) => (
                          <option value={t.id} key={t.id}>
                            {t.name} · v{t.revision}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="bc-two">
                    {Object.keys(c.fields)
                      .filter((key) => c.templateBody.includes(`{{${key}}}`))
                      .map((key) => (
                        <label key={key}>
                          {
                            {
                              service: "服務名稱",
                              fee: "示範收費",
                              branch: "分店",
                              date: "日期",
                              time: "時間",
                            }[key]
                          }
                          <input
                            aria-label={`推播參數 ${key}`}
                            disabled={!!c.launchedAt}
                            value={c.fields[key as keyof typeof c.fields]}
                            type={
                              key === "date"
                                ? "date"
                                : key === "time"
                                  ? "time"
                                  : "text"
                            }
                            maxLength={100}
                            onChange={(e) =>
                              patch({
                                fields: { ...c.fields, [key]: e.target.value },
                              })
                            }
                          />
                        </label>
                      ))}
                  </div>
                  <p className="bc-note">
                    稱呼由每位客戶資料帶入。到店提醒會另查同事已核實嘅預約，未核實會排除。
                  </p>
                </div>
                <div className="bc-preview-card">
                  <div>
                    <MessageSquare size={15} />
                    客戶訊息預覽<span>示範渠道</span>
                  </div>
                  <blockquote>
                    {eligible[0]?.body ?? rows[0]?.body ?? c.templateBody}
                  </blockquote>
                  <small>
                    使用虛構品牌與範本。並未取得 Meta 核准或連接真實號碼。
                  </small>
                </div>
              </div>
              <div className="bc-section-heading bc-audience-heading">
                <div>
                  <h2>發送前檢查</h2>
                  <p>
                    {rows.length} 位品牌客戶 · {eligible.length} 位符合示範資格
                    · {rows.length - eligible.length} 位排除
                  </p>
                </div>
                <input
                  aria-label="搜尋推播名單"
                  placeholder="搜尋名單（只影響顯示）"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="bc-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>客戶</th>
                      <th>渠道 / 分組</th>
                      <th>檢查結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .filter((r) =>
                        (r.contact.name + r.contact.phone)
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((r) => (
                        <tr key={r.contact.id}>
                          <td>
                            <strong>{r.contact.name}</strong>
                            <small>{r.contact.phone}</small>
                          </td>
                          <td>
                            {r.conversation.channel}
                            <small>
                              {r.profile?.customerType === "existing"
                                ? "現客"
                                : "新客"}
                            </small>
                          </td>
                          <td>
                            {r.reasons.length ? (
                              r.reasons.map((reason) => (
                                <span className="bc-reason" key={reason}>
                                  {reason}
                                </span>
                              ))
                            ) : (
                              <span className="bc-badge is-good">
                                <Check size={12} />
                                符合示範資格
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="bc-section-heading">
                <div>
                  <h2>{c.name} · 成效</h2>
                  <p>
                    所有結果來自下方事件；測試回執不代表真實 WhatsApp 送達。
                  </p>
                </div>
                <button
                  className="bc-button"
                  disabled={!recipients.length}
                  onClick={csv}
                >
                  <Download size={14} />
                  匯出事件 CSV
                </button>
              </div>
              <div className="bc-metrics">
                {[
                  { l: "示範發送", n: m!.sent },
                  { l: "示範送達", n: m!.delivered },
                  { l: "示範已讀", n: m!.read },
                  { l: "客戶回覆", n: m!.replied },
                  { l: "已核實預約", n: m!.booked },
                  { l: "人手到店", n: m!.arrived },
                ].map((k) => (
                  <article key={k.l}>
                    <span>{k.l}</span>
                    <strong>{k.n}</strong>
                  </article>
                ))}
              </div>
              <div className="bc-report-grid">
                <div className="bc-card">
                  <h3>由訊息到預約</h3>
                  {[
                    { l: "發送", v: m!.sent },
                    { l: "送達", v: m!.delivered },
                    { l: "回覆", v: m!.replied },
                    { l: "核實預約", v: m!.booked },
                    { l: "人手到店", v: m!.arrived },
                  ].map((row) => (
                    <div className="bc-bar" key={row.l}>
                      <span>{row.l}</span>
                      <div>
                        <i
                          style={{
                            width: m!.sent
                              ? `${(row.v / m!.sent) * 100}%`
                              : "0%",
                          }}
                        />
                      </div>
                      <b>{row.v}</b>
                    </div>
                  ))}
                </div>
                <div className="bc-card bc-rates">
                  <h3>計算口徑</h3>
                  <dl>
                    <dt>回覆率（回覆 / 發送）</dt>
                    <dd>
                      {m!.replyRate === null
                        ? "—"
                        : `${(m!.replyRate * 100).toFixed(1)}%`}
                    </dd>
                    <dt>預約率（核實預約 / 回覆）</dt>
                    <dd>
                      {m!.bookRate === null
                        ? "—"
                        : `${(m!.bookRate * 100).toFixed(1)}%`}
                    </dd>
                    <dt>示範失敗 / 退訂</dt>
                    <dd>
                      {m!.failed} / {m!.optout}
                    </dd>
                    <dt>實際渠道費用 / 收入</dt>
                    <dd>未接資料</dd>
                  </dl>
                  <p>
                    預約意向不計 Book；要由同事核實。到店只用人手示範記錄，無
                    POS 推算。
                  </p>
                </div>
              </div>
              <div className="bc-section-heading">
                <div>
                  <h2>逐位回執及跟進</h2>
                  <p>按「體驗回覆」由客戶角度回覆，再提交預約意向。</p>
                </div>
                <span className="bc-badge">全部事件來源：Demo</span>
              </div>
              <div className="bc-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>客戶</th>
                      <th>目前結果</th>
                      <th>測試回執</th>
                      <th>跟進</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((r) => {
                      const p = d.state.inbox.contacts.find(
                          (p) => p.id === r.contactId,
                        )!,
                        booking = d.state.inbox.bookings.find(
                          (b) => b.id === r.bookingId,
                        );
                      return (
                        <tr key={r.id}>
                          <td>
                            <strong>{p.name}</strong>
                            <small>{p.phone}</small>
                          </td>
                          <td>
                            <span className="bc-badge">
                              {statusLabels[recipientStatus(b, r)]}
                            </span>
                            <small>
                              {booking
                                ? `${booking.service} · ${booking.status === "confirmed" ? "已核實" : booking.status === "cancelled" ? "已取消" : "待核實"}`
                                : "未有連結預約"}
                            </small>
                          </td>
                          <td>
                            <div className="bc-inline-actions">
                              <button
                                onClick={() =>
                                  d.dispatch({
                                    type: "receipt",
                                    recipientId: r.id,
                                    kind: "delivered",
                                    at: actionTime(),
                                  })
                                }
                              >
                                送達
                              </button>
                              <button
                                onClick={() =>
                                  d.dispatch({
                                    type: "receipt",
                                    recipientId: r.id,
                                    kind: "read",
                                    at: actionTime(),
                                  })
                                }
                              >
                                已讀
                              </button>
                              <button
                                onClick={() =>
                                  d.dispatch({
                                    type: "receipt",
                                    recipientId: r.id,
                                    kind: "failed",
                                    at: actionTime(),
                                  })
                                }
                              >
                                失敗
                              </button>
                            </div>
                            <div className="bc-inline-actions">
                              <button
                                disabled={booking?.status !== "confirmed"}
                                onClick={() =>
                                  d.dispatch({
                                    type: "receipt",
                                    recipientId: r.id,
                                    kind: "arrived",
                                    at: actionTime(),
                                  })
                                }
                              >
                                記錄到店
                              </button>
                              <button
                                disabled={booking?.status !== "confirmed"}
                                onClick={() =>
                                  d.dispatch({
                                    type: "receipt",
                                    recipientId: r.id,
                                    kind: "missed",
                                    at: actionTime(),
                                  })
                                }
                              >
                                未到店
                              </button>
                            </div>
                          </td>
                          <td>
                            <button
                              className="bc-text-button"
                              onClick={() => experience(r.id)}
                            >
                              體驗回覆
                              <ArrowRight size={12} />
                            </button>
                            <button
                              className="bc-text-button"
                              onClick={() => onInbox(r.conversationId)}
                            >
                              開啟對話
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!recipients.length && (
                  <p className="bc-note">尚未發送。請先完成內容與名單檢查。</p>
                )}
              </div>
              <details className="bc-audit">
                <summary>事件明細 · 可追溯來源</summary>
                {b.events
                  .filter((e) => e.campaignId === c.id)
                  .toReversed()
                  .map((e) => (
                    <p key={e.id}>
                      <time>{date(e.at)}</time>
                      <strong>{statusLabels[e.kind]}</strong>
                      <span>
                        {
                          d.state.inbox.contacts.find(
                            (p) =>
                              p.id ===
                              b.recipients.find((r) => r.id === e.recipientId)
                                ?.contactId,
                          )?.name
                        }
                      </span>
                      <small>{e.detail} · Demo</small>
                    </p>
                  ))}
              </details>
            </>
          )}
        </div>
        <footer className="bc-footer">
          <ShieldCheck size={12} />
          真實 WhatsApp 發送未接通 · 設定及事件只保留於此瀏覽器
          <span>{d.storage}</span>
        </footer>
      </div>
      {confirm && c && (
        <Modal
          title="確認示範推播"
          subtitle="只測試發送流程，不會向真實電話發訊息。"
          onClose={() => setConfirm(false)}
        >
          <div className="bc-confirm">
            <h3>{c.name}</h3>
            <p>
              本次會向 {eligible.length} 位符合條件嘅虛構／匯入聯絡人加入 Demo
              訊息。開始時會重新檢查同意、退訂、範本版本同重複名單。
            </p>
            <blockquote>{eligible[0]?.body}</blockquote>
            <footer>
              <button className="bc-button" onClick={() => setConfirm(false)}>
                取消
              </button>
              <button
                className="bc-button bc-primary"
                disabled={!eligible.length}
                onClick={() => {
                  d.dispatch({
                    type: "campaign-launch",
                    id: c.id,
                    at: actionTime(),
                  });
                  setConfirm(false);
                  setTab("report");
                }}
              >
                確認模擬推播
                <Send size={14} />
              </button>
            </footer>
          </div>
        </Modal>
      )}
      {notice && (
        <div className="st-notice" role="status">
          {notice}
          <button aria-label="關閉推播提示" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </section>
  );
}
