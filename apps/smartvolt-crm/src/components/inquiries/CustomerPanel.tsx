"use client";
import { useState } from "react";
import { CTagHint } from "@/components/copilot/CopilotProvider";
import Link from "next/link";
import {
  CalendarDays,
  Link2,
  History,
  Pencil,
  ArrowUpRight,
  Search,
} from "lucide-react";
import { fromHongKongInput, toHongKongInput } from "@/lib/meta/operations";
import {
  bookingNames,
  type Availability,
  type BookingRequest,
  type CustomerDetail,
  type Inquiry,
  type InquiryAction,
} from "@/lib/inquiries/model";
export type Mutate = (
  endpoint: "inbox" | "customers",
  data: unknown,
) => Promise<boolean | undefined>;
const time = (value: string | number) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
function EventText({
  kind,
  detail,
}: {
  kind: string;
  detail: Record<string, unknown>;
}) {
  const text =
    kind === "pos-payment"
      ? `人工核實收款 HK$${Number(detail.amountCents ?? 0) / 100}`
      : kind === "pos-refund"
        ? `人工核實退款 HK$${Number(detail.amountCents ?? 0) / 100}`
        : kind === "pos-appointment"
          ? `${String(detail.serviceName ?? "預約")} · ${bookingNames[String(detail.status)] ?? String(detail.status)}`
          : kind === "identity-linked"
            ? "已確認渠道身份連結"
            : kind === "identity-unlinked"
              ? "渠道已改為連結另一客戶"
              : kind === "channel-linked"
                ? "建立渠道客戶身份"
                : kind === "customer-updated"
                  ? "更新客戶資料"
                  : kind === "booking-create"
                    ? "登記預約意向"
                    : kind === "booking-confirm"
                      ? "確認基本預約"
                      : kind === "booking-cancel"
                        ? "取消預約意向"
                        : kind;
  return (
    <>
      <b>{text}</b>
      {typeof detail.reason === "string" && <p>{detail.reason}</p>}
      {typeof detail.service === "string" && <p>{detail.service}</p>}
    </>
  );
}
function ConfirmBooking({
  request,
  companyId,
  hasPos,
  busy,
  mutate,
}: {
  request: BookingRequest;
  companyId: string;
  hasPos: boolean;
  busy: boolean;
  mutate: Mutate;
}) {
  const [open, setOpen] = useState(false),
    [at, setAt] = useState(toHongKongInput(request.desired_at)),
    [service, setService] = useState(""),
    [result, setResult] = useState<Availability | null>(null),
    [choice, setChoice] = useState(""),
    [verified, setVerified] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function check() {
    setLoading(true);
    setError("");
    setResult(null);
    setChoice("");
    setVerified(false);
    try {
      const instant = fromHongKongInput(at);
      if (!instant) throw new Error("請填入預約時間。");
      const r = await fetch(
        `/api/companies/${companyId}/inbox?` +
          new URLSearchParams({
            requestId: request.id,
            serviceId: service,
            at: String(Date.parse(instant)),
          }),
        { cache: "no-store" },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "未能核對時段。");
      setResult(d);
      if (!service && d.services[0]) setService(d.services[0].id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const selection = choice === "" ? undefined : result?.choices[Number(choice)];
  return (
    <article className="iq-booking">
      <div>
        <span className="iq-badge">
          {bookingNames[request.appointment?.status ?? request.status]}
        </span>
        <strong>{request.appointment?.serviceName ?? request.service}</strong>
        <small>
          {time(request.appointment?.startsAt ?? request.desired_at)} ·{" "}
          {request.guests} 位
        </small>
      </div>
      {request.status === "requested" && (
        <button
          disabled={busy}
          onClick={() => {
            setOpen(!open);
            if (hasPos && !result) void check();
          }}
        >
          {open ? "收起" : "核對及確認"}
        </button>
      )}
      {request.status === "linked" && hasPos && (
        <Link
          className="iq-text-link"
          href={`/company/${companyId}/pos?contact=${encodeURIComponent(request.customer_id)}&brand=${encodeURIComponent(request.brand_id)}`}
        >
          到 POS 管理 <ArrowUpRight size={13} />
        </Link>
      )}
      {open && request.status === "requested" && (
        <div className="iq-booking-confirm">
          {hasPos && (
            <>
              <label>
                服務
                <select
                  disabled={busy || loading}
                  value={service}
                  onChange={(e) => {
                    setService(e.target.value);
                    setResult((r) => (r ? { ...r, choices: [] } : null));
                    setVerified(false);
                  }}
                >
                  <option value="">選擇 POS 服務</option>
                  {result?.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.durationMinutes} 分鐘
                    </option>
                  ))}
                </select>
              </label>
              <label>
                預約時間（香港）
                <input
                  disabled={busy || loading}
                  type="datetime-local"
                  value={at}
                  onChange={(e) => {
                    setAt(e.target.value);
                    setResult((r) => (r ? { ...r, choices: [] } : null));
                    setVerified(false);
                  }}
                />
              </label>
              <button
                disabled={busy || loading || !service}
                onClick={() => void check()}
              >
                {loading ? "正在核對…" : "查可用人員及資源"}
              </button>
              {result?.blocker && <p role="status">{result.blocker}</p>}
              {!!result?.choices.length && (
                <label>
                  可用安排
                  <select
                    value={choice}
                    disabled={busy}
                    onChange={(e) => {
                      setChoice(e.target.value);
                      setVerified(false);
                    }}
                  >
                    <option value="">選擇安排</option>
                    {result.choices.map((c, i) => (
                      <option value={i} key={c.staffId + ":" + c.resourceId}>
                        {c.staffName} · {c.resourceName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <label className="iq-check">
            <input
              type="checkbox"
              disabled={busy}
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            已核實客戶同意、服務、時間及名額
          </label>
          {error && <p role="alert">{error}</p>}
          <button
            className="iq-primary"
            disabled={busy || !verified || (hasPos && !selection)}
            onClick={() => {
              const command: InquiryAction =
                hasPos && selection && result
                  ? {
                      action: "booking-convert",
                      commandId: crypto.randomUUID(),
                      requestId: request.id,
                      requestRevision: result.requestRevision,
                      revision: result.revision,
                      serviceId: service,
                      staffId: selection.staffId,
                      resourceId: selection.resourceId,
                      startsAt: selection.startsAt,
                      confirmed: true,
                    }
                  : {
                      action: "booking-confirm",
                      commandId: crypto.randomUUID(),
                      requestId: request.id,
                      revision: request.revision,
                    };
              void mutate("inbox", command).then((ok) => {
                if (ok) setOpen(false);
                else if (ok === false) {
                  setVerified(false);
                  if (hasPos) void check();
                }
              });
            }}
          >
            確認預約{hasPos ? "並同步 POS" : ""}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void mutate("inbox", {
                action: "booking-cancel",
                commandId: crypto.randomUUID(),
                requestId: request.id,
                revision: request.revision,
              })
            }
          >
            取消意向
          </button>
        </div>
      )}
    </article>
  );
}
export default function CustomerPanel({
  data,
  thread,
  companyId,
  hasPos,
  canEdit,
  busy,
  mutate,
  onLoadMore,
}: {
  data: CustomerDetail;
  thread?: Inquiry;
  companyId: string;
  hasPos: boolean;
  canEdit: boolean;
  busy: boolean;
  mutate: Mutate;
  onLoadMore?: () => void;
}) {
  const [tab, setTab] = useState("profile"),
    [editing, setEditing] = useState(false),
    [linking, setLinking] = useState(false),
    [booking, setBooking] = useState(false),
    [candidates, setCandidates] = useState<
      { id: string; name: string; phone: string }[]
    >([]),
    [search, setSearch] = useState(""),
    [target, setTarget] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [searching, setSearching] = useState(false);
  const c = data.customer;
  return (
    <aside className="iq-customer" aria-label="共用客戶資料">
      <div className="iq-customer-heading">
        <span className="iq-avatar">{c.name.slice(0, 1)}</span>
        <h2>
          {c.name}
          <small>共用客戶檔案</small>
        </h2>
      </div>
      <div className="iq-customer-tabs" role="tablist" aria-label="客戶資訊">
        {[
          ["profile", "客戶資料"],
          ["bookings", "預約"],
          ["history", "時間線"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "profile" && (
        <div className="iq-panel-content">
          <dl>
            <div>
              <dt>聯絡電話</dt>
              <dd>{c.phone || "未提供"}</dd>
            </div>
            <div>
              <dt>電郵</dt>
              <dd>{c.email || "未提供"}</dd>
            </div>
            <div>
              <dt>首次記錄來源</dt>
              <dd>{c.source || "未有來源證據"}</dd>
            </div>
          </dl>
          <div className="iq-tags">
            {c.tags.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <p className="iq-note">
            {c.note || "加入客戶偏好及長期備忘，方便同事接手。"}
          </p>
          <div className="iq-identity">
            <b>
              <Link2 size={14} /> 已連結渠道
            </b>
            {data.links.map((l) => (
              <Link
                key={l.provider + l.thread_id}
                href={`/company/${companyId}/crm?provider=${l.provider}&thread=${l.thread_id}`}
              >
                {l.provider === "whatsapp" ? "WhatsApp" : "社交對話"}
                <ArrowUpRight size={12} />
              </Link>
            ))}
            {!data.links.length && <small>未有已連結渠道</small>}
          </div>
          {canEdit && (
            <>
              <button onClick={() => setEditing(!editing)} disabled={busy}>
                <Pencil size={14} />
                編輯客戶資料
              </button>
              {thread && (
                <button onClick={() => setLinking(!linking)} disabled={busy}>
                  <Link2 size={14} />
                  連結已有客戶
                </button>
              )}
            </>
          )}
          {editing && (
            <form
              className="iq-inline-form"
              key={c.revision}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void mutate("customers", {
                  id: c.id,
                  revision: c.revision,
                  commandId: crypto.randomUUID(),
                  data: {
                    name: String(f.get("name")),
                    phone: String(f.get("phone")),
                    email: String(f.get("email")),
                    tags: String(f.get("tags"))
                      .split("、")
                      .map((t) => t.trim())
                      .filter(Boolean),
                    note: String(f.get("note")),
                  },
                }).then((ok) => {
                  if (ok) setEditing(false);
                });
              }}
            >
              <fieldset disabled={busy}>
                <label>
                  客戶名稱
                  <input
                    name="name"
                    required
                    maxLength={80}
                    defaultValue={c.name}
                  />
                </label>
                <label>
                  電話
                  <input name="phone" maxLength={40} defaultValue={c.phone} />
                </label>
                <label>
                  電郵
                  <input
                    name="email"
                    type="email"
                    maxLength={160}
                    defaultValue={c.email}
                  />
                </label>
                <label>
                  標籤（用「、」分隔）
                  <input
                    name="tags"
                    data-copilot-activity="tagging"
                    defaultValue={c.tags.join("、")}
                  />
                  <CTagHint customerId={c.id} />
                </label>
                <label>
                  備忘
                  <textarea
                    name="note"
                    maxLength={12000}
                    defaultValue={c.note}
                  />
                </label>
              </fieldset>
              <button className="iq-primary" disabled={busy}>
                儲存客戶資料
              </button>
            </form>
          )}
          {linking && thread && (
            <form
              className="iq-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                setError("");
                if (!target || reason.trim().length < 3) {
                  setError("請選擇客戶並填入核實原因。 ");
                  return;
                }
                void mutate("inbox", {
                  action: "relink",
                  provider: thread.provider,
                  threadId: thread.id,
                  commandId: crypto.randomUUID(),
                  customerId: target,
                  revision: thread.link_revision,
                  reason,
                }).then((ok) => {
                  if (ok) {
                    setLinking(false);
                    setTarget("");
                    setReason("");
                  }
                });
              }}
            >
              <p>確認係同一客人後再連結。既有預約同交易會保留原客戶歸屬。</p>
              <label>
                搜尋同品牌客戶
                <input
                  value={search}
                  disabled={busy || searching}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={100}
                />
              </label>
              <button
                type="button"
                disabled={busy || searching || !search.trim()}
                onClick={() => {
                  setSearching(true);
                  setError("");
                  void fetch(
                    `/api/companies/${companyId}/customers?` +
                      new URLSearchParams({ brand: thread.brand_id, search }),
                    { cache: "no-store" },
                  )
                    .then(async (r) => {
                      const d = await r.json();
                      if (!r.ok) throw new Error(d.error);
                      setCandidates(d.customers);
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setSearching(false));
                }}
              >
                <Search size={14} />
                {searching ? "搜尋中…" : "搜尋客戶"}
              </button>
              <label>
                已核實的客戶
                <select
                  disabled={busy}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">選擇客戶</option>
                  {candidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.phone || "未提供電話"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                核實依據
                <textarea
                  disabled={busy}
                  value={reason}
                  minLength={3}
                  maxLength={300}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="例如：客人確認會員身份及聯絡資料"
                />
              </label>
              <button
                className="iq-primary"
                disabled={busy || !target || reason.trim().length < 3}
              >
                確認連結
              </button>
            </form>
          )}
          {hasPos && (
            <Link
              className="iq-pos-link"
              href={`/company/${companyId}/pos?contact=${encodeURIComponent(c.id)}&brand=${encodeURIComponent(thread?.brand_id ?? c.brandIds[0] ?? "")}`}
            >
              查看 POS 預約及交易 <ArrowUpRight size={15} />
            </Link>
          )}
        </div>
      )}
      {tab === "bookings" && (
        <div className="iq-panel-content">
          {thread && canEdit && (
            <button
              className="iq-primary"
              disabled={busy}
              onClick={() => setBooking(!booking)}
            >
              <CalendarDays size={15} />
              新增預約意向
            </button>
          )}
          {booking && thread && (
            <form
              className="iq-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                setError("");
                const f = new FormData(e.currentTarget);
                try {
                  const desiredAt = fromHongKongInput(String(f.get("at")));
                  if (!desiredAt) throw new Error("請填入預約時間。");
                  void mutate("inbox", {
                    action: "booking-create",
                    provider: thread.provider,
                    threadId: thread.id,
                    commandId: crypto.randomUUID(),
                    requestId: crypto.randomUUID(),
                    customerId: c.id,
                    linkRevision: thread.link_revision,
                    service: String(f.get("service")),
                    desiredAt,
                    guests: Number(f.get("guests")),
                    note: String(f.get("note")),
                  }).then((ok) => {
                    if (ok) setBooking(false);
                  });
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <fieldset disabled={busy}>
                <label>
                  服務／課程
                  <input name="service" maxLength={100} required />
                </label>
                <label>
                  心儀時間（香港）
                  <input name="at" type="datetime-local" required />
                </label>
                <label>
                  人數
                  <input
                    name="guests"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={1}
                    required
                  />
                </label>
                <label>
                  交接備忘
                  <textarea name="note" maxLength={1000} />
                </label>
              </fieldset>
              <p>先登記意向，核實安排後再確認預約。</p>
              <button className="iq-primary" disabled={busy}>
                登記意向
              </button>
            </form>
          )}
          {data.requests.map((r) => (
            <ConfirmBooking
              key={r.id + ":" + r.revision}
              request={r}
              companyId={companyId}
              hasPos={hasPos}
              busy={busy || !canEdit}
              mutate={mutate}
            />
          ))}
          {!data.requests.length && (
            <p className="iq-empty-small">
              未有預約意向。客戶提出需要後，可以喺呢度交接安排。
            </p>
          )}
          {data.hasMoreRequests && (
            <small>顯示最近 20 項；已交接預約可於 POS 查閱。</small>
          )}
        </div>
      )}
      {tab === "history" && (
        <div className="iq-panel-content">
          <p className="iq-section-label">
            <History size={14} />
            客戶活動及營運紀錄
          </p>
          <ol className="iq-timeline">
            {data.events.map((e) => (
              <li key={e.seq}>
                <span />
                <div>
                  <EventText kind={e.kind} detail={e.detail} />
                  <time>{time(e.created_at)}</time>
                </div>
              </li>
            ))}
          </ol>
          {!data.events.length && <p>未有已記錄嘅活動。</p>}
          {data.nextEvent && onLoadMore && (
            <button disabled={busy} onClick={onLoadMore}>
              載入較早紀錄
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="iq-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
