"use client";
import { useState, type ReactNode, type FormEvent } from "react";
import {
  ArrowRight,
  Clock3,
  CreditCard,
  Gift,
  UserRound,
  Printer,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Modal } from "@/components/crm/conversations/WorkspacePrimitives";
import {
  activeRedemption,
  orderTotals,
  remainingUnits,
} from "@/lib/pos/engine";
import {
  hkDate,
  hkTime,
  localToMillis,
  money,
  parseMoney,
} from "@/lib/pos/money";
import type {
  Appointment,
  CatalogItem,
  Order,
  Resource,
} from "@/lib/pos/model";
import { type Dialog, newId, statusLabels, usePos } from "./context";
export default function PosDialogs({
  dialog,
  onClose,
}: {
  dialog: Dialog;
  onClose: () => void;
}) {
  const { pos } = usePos();
  if (dialog.kind === "appointment")
    return (
      <AppointmentForm
        appointment={dialog.appointment}
        start={dialog.start}
        onClose={onClose}
      />
    );
  if (dialog.kind === "appointment-detail") {
    const a = pos.appointments.find((a) => a.id === dialog.id);
    return a ? <AppointmentDetail appointment={a} onClose={onClose} /> : null;
  }
  if (dialog.kind === "customer-detail")
    return (
      <CustomerDetail
        id={dialog.id}
        brandId={dialog.brandId}
        onClose={onClose}
      />
    );
  if (dialog.kind === "customer") return <CustomerForm onClose={onClose} />;
  if (dialog.kind === "catalog")
    return <CatalogForm item={dialog.item} onClose={onClose} />;
  if (dialog.kind === "resource")
    return <ResourceForm resource={dialog.resource} onClose={onClose} />;
  if (dialog.kind === "reverse")
    return <CorrectionForm kind="reverse" id={dialog.id} onClose={onClose} />;
  const order = pos.orders.find((o) => o.id === dialog.id);
  if (!order) return null;
  if (dialog.kind === "payment")
    return <PaymentForm order={order} onClose={onClose} />;
  if (dialog.kind === "receipt")
    return <Receipt order={order} onClose={onClose} />;
  return <CorrectionForm kind={dialog.kind} id={dialog.id} onClose={onClose} />;
}
function FormFrame({
  children,
  onSubmit,
  onClose,
  submit = "儲存",
  disabled = false,
  error = "",
}: {
  children: ReactNode;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  submit?: string;
  disabled?: boolean;
  error?: string;
}) {
  const [caught, setCaught] = useState("");
  return (
    <form
      className="sv-form"
      onSubmit={(e) => {
        try {
          setCaught("");
          onSubmit(e);
        } catch (err) {
          e.preventDefault();
          setCaught(err instanceof Error ? err.message : "請檢查資料。");
        }
      }}
    >
      {children}
      {(error || caught) && (
        <p className="sv-form-error" role="alert">
          {caught || error}
        </p>
      )}
      <footer className="sv-form-footer">
        <button type="button" className="sv-secondary" onClick={onClose}>
          取消
        </button>
        <button className="sv-primary" disabled={disabled}>
          {submit}
        </button>
      </footer>
    </form>
  );
}
function AppointmentForm({
  appointment: a,
  start,
  onClose,
}: {
  appointment?: Appointment;
  start?: string;
  onClose: () => void;
}) {
  const { pos, brand, customer, identity, workspace, date, run, customerName } =
    usePos();
  const services = pos.catalog.filter(
    (i) => i.brandId === brand && i.kind === "service" && i.active,
  );
  const [serviceId, setService] = useState(
    a?.serviceId ?? services[0]?.id ?? "",
  );
  const item = services.find((i) => i.id === serviceId);
  const linkedOrder =
    !!a &&
    pos.orders.some(
      (o) => o.appointmentId === a.id && !o.voided && o.lines.length > 0,
    );
  const [resourceId, setResource] = useState(
    a?.resourceId ??
      pos.resources.find(
        (r) => r.active && r.brandId === brand && r.kind === item?.resourceKind,
      )?.id ??
      "",
  );
  const [contactId, setContact] = useState(a?.contactId ?? customer);
  const [staffId, setStaff] = useState(
    a?.staffId ?? identity.scope.team[0]?.id ?? "",
  );
  const [startsAt, setStart] = useState(
    a
      ? `${hkDate(a.startsAt)}T${hkTime(a.startsAt)}`
      : (start ?? `${date}T10:00`),
  );
  const [guests, setGuests] = useState(a?.guests ?? 1),
    [note, setNote] = useState(a?.note ?? ""),
    [status, setStatus] = useState<"pending" | "confirmed">(
      a?.status === "pending" ? "pending" : "confirmed",
    ),
    [error, setError] = useState("");
  const contacts = workspace.state.inbox.contacts.filter(
    (c) =>
      c.brandIds?.includes(brand) ||
      workspace.state.inbox.conversations.some(
        (cv) => cv.contactId === c.id && cv.brandId === brand,
      ),
  );
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const at = localToMillis(startsAt);
    if (!Number.isFinite(at)) {
      setError("請填入有效嘅香港日期同時間。");
      return;
    }
    if (
      run(
        {
          kind: "appointment-save",
          id: newId(),
          appointmentId: a?.id ?? newId(),
          contactId,
          serviceId,
          staffId,
          resourceId: item?.resourceKind === "none" ? null : resourceId || null,
          startsAt: at,
          guests,
          note,
          status,
        },
        a ? "預約已更新。" : "預約已建立，客戶資料已更新。",
      )
    )
      onClose();
    else setError("未能儲存。請核對同事、客戶同場地有冇撞期，或確認操作權限。");
  }
  return (
    <Modal
      title={a ? "編輯預約" : "新增預約"}
      subtitle="時段會連同服務後緩衝、同事同場地容量一齊檢查。"
      onClose={onClose}
    >
      <FormFrame
        onSubmit={submit}
        onClose={onClose}
        submit={a ? "更新預約" : "建立預約"}
        error={error}
        disabled={!services.length || !contacts.length}
      >
        <label>
          預約客戶
          <select
            aria-label="預約客戶"
            required
            disabled={!!a}
            value={contactId}
            onChange={(e) => setContact(e.target.value)}
          >
            <option value="">選擇客戶…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {customerName(c.id)} · {c.phone}
              </option>
            ))}
          </select>
        </label>
        <label>
          預約服務
          <select
            aria-label="預約服務"
            required
            value={serviceId}
            onChange={(e) => {
              setService(e.target.value);
              const i = services.find((i) => i.id === e.target.value);
              setResource(
                pos.resources.find(
                  (r) =>
                    r.active &&
                    r.brandId === brand &&
                    r.kind === i?.resourceKind,
                )?.id ?? "",
              );
            }}
          >
            {services.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {i.durationMinutes} 分鐘 · {money(i.priceCents)}
              </option>
            ))}
          </select>
        </label>
        <div className="sv-form-grid">
          <label>
            香港日期及時間
            <input
              aria-label="預約日期及時間"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            負責同事
            <select
              aria-label="預約負責同事"
              value={staffId}
              onChange={(e) => setStaff(e.target.value)}
            >
              {identity.scope.team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="sv-form-grid">
          <label>
            房間／床位
            <select
              aria-label="預約資源"
              value={resourceId}
              disabled={item?.resourceKind === "none"}
              onChange={(e) => setResource(e.target.value)}
            >
              <option value="">
                {item?.resourceKind === "none" ? "毋須場地" : "選擇適用資源…"}
              </option>
              {pos.resources
                .filter(
                  (r) =>
                    r.active &&
                    r.brandId === brand &&
                    r.kind === item?.resourceKind,
                )
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · 容量 {r.capacity}
                  </option>
                ))}
            </select>
          </label>
          <label>
            人數
            <input
              aria-label="預約人數"
              type="number"
              min="1"
              max="30"
              required
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
            />
          </label>
        </div>
        <label>
          預約狀態
          <select
            aria-label="新增預約狀態"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="confirmed">同事已核實確認</option>
            <option value="pending">待同事確認</option>
          </select>
        </label>
        <label>
          安排備註
          <textarea
            aria-label="預約安排備註"
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：首次到店、需要提早準備…"
          />
        </label>
        <div className="sv-form-callout">
          <Clock3 size={17} />
          <span>
            {item
              ? `${item.durationMinutes} 分鐘服務 + ${item.bufferMinutes} 分鐘整理緩衝 · ${money(linkedOrder && a ? a.priceCents : item.priceCents * guests)}`
              : "先喺服務設定新增服務同資源，再建立預約。"}
          </span>
        </div>
        {!contacts.length && <p>請先喺收銀台登記客戶。</p>}
      </FormFrame>
    </Modal>
  );
}
function AppointmentDetail({
  appointment: a,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const {
    pos,
    identity,
    run,
    open,
    customerDetails,
    checkout,
    customerName,
    workspace,
  } = usePos();
  const [packId, setPack] = useState(""),
    [verified, setVerified] = useState(false);
  const packs = pos.entitlements.filter(
    (p) =>
      p.contactId === a.contactId &&
      p.brandId === a.brandId &&
      p.serviceId === a.serviceId &&
      !p.revoked &&
      p.expiresAt > workspace.now &&
      remainingUnits(pos, p.id) > 0,
  );
  const redemption = activeRedemption(pos, a.id),
    orders = pos.orders.filter((o) => o.appointmentId === a.id && !o.voided);
  return (
    <Modal
      title="預約詳情"
      subtitle={`${hkDate(a.startsAt)} · 香港時間`}
      onClose={onClose}
    >
      <div className="sv-detail">
        <div className="sv-detail-customer">
          <span className="sv-avatar">
            {customerName(a.contactId).slice(0, 1)}
          </span>
          <div>
            <h3>{customerName(a.contactId)}</h3>
            <span>{a.serviceName}</span>
          </div>
          <span className={`sv-status sv-status-${a.status}`}>
            {statusLabels[a.status]}
          </span>
        </div>
        <dl className="sv-detail-grid">
          <div>
            <dt>服務時間</dt>
            <dd>
              {hkTime(a.startsAt)} – {hkTime(a.endsAt)}
            </dd>
          </div>
          <div>
            <dt>預約金額</dt>
            <dd>{money(a.priceCents)}</dd>
          </div>
          <div>
            <dt>負責同事</dt>
            <dd>{identity.scope.team.find((t) => t.id === a.staffId)?.name}</dd>
          </div>
          <div>
            <dt>場地 / 人數</dt>
            <dd>
              {pos.resources.find((r) => r.id === a.resourceId)?.name ??
                "毋須場地"}{" "}
              · {a.guests} 人
            </dd>
          </div>
        </dl>
        {a.note && <p className="sv-detail-note">{a.note}</p>}
        <button
          className="sv-secondary sv-full"
          onClick={() => customerDetails(a.contactId, a.brandId)}
        >
          <UserRound size={15} />
          開啟客戶資料
          <ArrowRight size={14} />
        </button>
        {orders.map((o) => (
          <div className="sv-detail-order" key={o.id}>
            <span>
              <ReceiptText size={16} />
              {o.number}
              <small>{orderTotals(pos, o).status}</small>
            </span>
            <button className="sv-text-button" onClick={() => checkout(a, o)}>
              訂單收銀
              <ArrowRight size={13} />
            </button>
          </div>
        ))}
        {a.status === "checked_in" &&
          a.guests === 1 &&
          packs.length > 0 &&
          !orders.length && (
            <div className="sv-redeem-panel">
              <h4>
                <Gift size={17} />
                使用客戶套票
              </h4>
              <label>
                適用套票
                <select
                  aria-label="核銷套票"
                  value={packId}
                  onChange={(e) => setPack(e.target.value)}
                >
                  <option value="">選擇套票…</option>
                  {packs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · 尚餘 {remainingUnits(pos, p.id)} 次
                    </option>
                  ))}
                </select>
              </label>
              <label className="sv-checkbox">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                />
                我確認服務已完成，扣減一次套票
              </label>
              <button
                className="sv-primary sv-full"
                disabled={!packId || !verified}
                onClick={() => {
                  if (
                    run(
                      {
                        kind: "package-redeem",
                        id: newId(),
                        appointmentId: a.id,
                        entitlementId: packId,
                      },
                      "已核銷一次套票，並完成服務。",
                    )
                  ) {
                    setVerified(false);
                    setPack("");
                  }
                }}
              >
                核銷一次並完成
              </button>
            </div>
          )}
        {redemption && (
          <div className="sv-form-callout">
            <Gift size={18} />
            <span>
              已核銷一次 ·{" "}
              {
                pos.entitlements.find((p) => p.id === redemption.entitlementId)
                  ?.name
              }
            </span>
            {["owner", "manager"].includes(identity.actor.role) && (
              <button
                className="sv-text-button"
                onClick={() => open({ kind: "reverse", id: redemption.id })}
              >
                撤銷核銷
              </button>
            )}
          </div>
        )}
        <div className="sv-detail-actions">
          {["pending", "confirmed"].includes(a.status) && (
            <button
              className="sv-secondary"
              onClick={() => open({ kind: "appointment", appointment: a })}
            >
              編輯 / 改期
            </button>
          )}
          {a.status === "pending" && (
            <button
              className="sv-primary"
              onClick={() =>
                run({
                  kind: "appointment-status",
                  id: newId(),
                  appointmentId: a.id,
                  status: "confirmed",
                })
              }
            >
              確認預約
            </button>
          )}
          {a.status === "confirmed" && (
            <>
              <button
                className="sv-secondary"
                onClick={() =>
                  run({
                    kind: "appointment-status",
                    id: newId(),
                    appointmentId: a.id,
                    status: "no_show",
                  })
                }
              >
                登記未到店
              </button>
              <button
                className="sv-primary"
                onClick={() =>
                  run(
                    {
                      kind: "appointment-status",
                      id: newId(),
                      appointmentId: a.id,
                      status: "checked_in",
                    },
                    "已登記到店。",
                  )
                }
              >
                登記到店
              </button>
            </>
          )}
          {a.status === "checked_in" && (
            <>
              <button className="sv-secondary" onClick={() => checkout(a)}>
                前往收銀
              </button>
              <button
                className="sv-primary"
                onClick={() =>
                  run(
                    {
                      kind: "appointment-status",
                      id: newId(),
                      appointmentId: a.id,
                      status: "completed",
                    },
                    "已完成服務；付款狀態維持獨立記錄。",
                  )
                }
              >
                完成服務
              </button>
            </>
          )}
          {["pending", "confirmed", "checked_in"].includes(a.status) && (
            <button
              className="sv-text-button sv-danger-text"
              onClick={() => {
                if (
                  run(
                    {
                      kind: "appointment-status",
                      id: newId(),
                      appointmentId: a.id,
                      status: "cancelled",
                    },
                    "預約已取消，付款記錄會保留。",
                  )
                )
                  onClose();
              }}
            >
              取消預約
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
function CustomerForm({ onClose }: { onClose: () => void }) {
  const { workspace, brand, setCustomer } = usePos();
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [error, setError] = useState("");
  return (
    <Modal
      title="新增到店客戶"
      subtitle="客戶資料、套票同消費記錄會儲存喺公司工作空間。"
      onClose={onClose}
    >
      <FormFrame
        onClose={onClose}
        error={error}
        submit="建立客戶"
        onSubmit={(e) => {
          e.preventDefault();
          const p = parsePhoneNumberFromString(phone, "HK");
          if (!p?.isValid()) {
            setError("請填入有效電話號碼。");
            return;
          }
          const existing = workspace.state.inbox.contacts.find(
            (c) =>
              c.phone === p.number &&
              workspace.state.inbox.conversations.some(
                (cv) => cv.contactId === c.id && cv.brandId === brand,
              ),
          );
          if (existing) {
            setCustomer(existing.id);
            onClose();
            return;
          }
          if (workspace.state.inbox.contacts.length >= 100) {
            setError("工作空間客戶已達目前上限。");
            return;
          }
          const id = newId();
          workspace.dispatch({
            type: "customer-create",
            id,
            brandId: brand,
            name,
            phone: p.number,
            at: Date.now(),
          });
          setCustomer(id);
          onClose();
        }}
      >
        <label>
          客戶姓名
          <input
            aria-label="新增客戶姓名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
        </label>
        <label>
          電話號碼
          <input
            aria-label="新增客戶電話"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+852"
            required
            maxLength={40}
          />
        </label>
        <div className="sv-form-callout">
          <ShieldCheck size={17} />
          <span>登記到店資料唔會自動授予推廣同意。</span>
        </div>
      </FormFrame>
    </Modal>
  );
}
function PaymentForm({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const { pos, run, identity } = usePos(),
    t = orderTotals(pos, order);
  const [amount, setAmount] = useState((t.due / 100).toFixed(2)),
    [method, setMethod] = useState<"cash" | "fps" | "card">("fps"),
    [reference, setReference] = useState(""),
    [verified, setVerified] = useState(false),
    [error, setError] = useState("");
  const [id] = useState(newId);
  return (
    <Modal
      title="登記已核實收款"
      subtitle={`${order.number} · 尚欠 ${money(t.due)}`}
      onClose={onClose}
    >
      <FormFrame
        onClose={onClose}
        error={error}
        submit="確認收款入帳"
        disabled={!verified}
        onSubmit={(e) => {
          e.preventDefault();
          const cents = parseMoney(amount);
          if (cents === null || cents <= 0 || cents > t.due) {
            setError("請填入大於零、而且不超出尾數嘅金額。");
            return;
          }
          if (
            run(
              {
                kind: "payment-record",
                id,
                orderId: order.id,
                amountCents: cents,
                method,
                reference,
              },
              "已登記核實收款；明細及套票狀態已更新。",
            )
          )
            onClose();
          else setError("未能入帳，請核對未收款金額同付款參考編號。");
        }}
      >
        <div className="sv-payment-methods">
          {[
            ["fps", "轉數快"],
            ["cash", "現金"],
            ["card", "信用卡"],
          ].map(([id, label]) => (
            <button
              type="button"
              aria-pressed={method === id}
              key={id}
              onClick={() => setMethod(id as typeof method)}
            >
              {id === "cash" ? <Wallet size={20} /> : <CreditCard size={20} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
        <label>
          本次收款金額（HKD）
          <input
            aria-label="本次收款金額"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <div className="sv-amount-shortcuts">
          <button
            type="button"
            onClick={() => setAmount((Math.round(t.due / 2) / 100).toFixed(2))}
          >
            收一半訂金
          </button>
          <button
            type="button"
            onClick={() => setAmount((t.due / 100).toFixed(2))}
          >
            收取全部尾數
          </button>
        </div>
        <label>
          已核實交易參考編號{method === "cash" ? "（選填）" : ""}
          <input
            aria-label="收款交易參考編號"
            value={reference}
            maxLength={160}
            onChange={(e) => setReference(e.target.value)}
            required={method !== "cash"}
          />
        </label>
        <label className="sv-checkbox">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          我已核實實際收到款項{identity.connected ? "" : "（示範）"}
        </label>
        <div className="sv-form-callout">
          <ShieldCheck size={18} />
          <span>
            {identity.connected
              ? "呢個操作只記錄款項，唔會向客戶扣款。"
              : "示範操作唔會處理真實款項。"}
            套票須付清整張訂單先會生效。
          </span>
        </div>
      </FormFrame>
    </Modal>
  );
}
function CorrectionForm({
  kind,
  id,
  onClose,
}: {
  kind: "refund" | "reverse" | "void";
  id: string;
  onClose: () => void;
}) {
  const { pos, run } = usePos(),
    order = pos.orders.find((o) => o.id === id),
    t = order ? orderTotals(pos, order) : null;
  const [reason, setReason] = useState(""),
    [verified, setVerified] = useState(false),
    [amount, setAmount] = useState(((t?.net ?? 0) / 100).toFixed(2)),
    [error, setError] = useState("");
  const [commandId] = useState(newId);
  return (
    <Modal
      title={
        kind === "refund"
          ? "登記已核實退款"
          : kind === "reverse"
            ? "撤銷套票核銷"
            : "作廢未付款訂單"
      }
      subtitle="原有交易同操作記錄會保留，方便日後核對。"
      onClose={onClose}
    >
      <FormFrame
        onClose={onClose}
        error={error}
        disabled={!verified}
        submit={
          kind === "refund"
            ? "確認退款入帳"
            : kind === "reverse"
              ? "確認撤銷核銷"
              : "確認作廢"
        }
        onSubmit={(e) => {
          e.preventDefault();
          let ok = false;
          if (kind === "refund") {
            const cents = parseMoney(amount);
            if (cents === null || cents <= 0) {
              setError("請填入有效退款金額。");
              return;
            }
            ok = run(
              {
                kind: "refund-record",
                id: commandId,
                orderId: id,
                amountCents: cents,
                reason,
              },
              "退款記錄已入帳；未有執行轉帳。",
            );
          } else if (kind === "reverse")
            ok = run(
              {
                kind: "redemption-reverse",
                id: commandId,
                redemptionId: id,
                reason,
              },
              "核銷已撤銷，原記錄及更正原因已保留。",
            );
          else
            ok = run(
              { kind: "order-void", id: commandId, orderId: id },
              "未付款訂單已作廢。",
            );
          if (ok) onClose();
          else
            setError(
              "此操作未能完成。請核對交易餘額、套票使用情況同操作權限。",
            );
        }}
      >
        {kind === "refund" && (
          <>
            <div className="sv-form-callout">
              <Wallet size={18} />
              <span>
                最多可退 {money(t?.net ?? 0)}
                。含套票訂單須全額退回，而且套票未有有效核銷。
              </span>
            </div>
            <label>
              退款金額（HKD）
              <input
                aria-label="退款金額"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                required
              />
            </label>
          </>
        )}
        {kind !== "void" && (
          <label>
            更正原因
            <textarea
              aria-label="更正原因"
              required
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        <label className="sv-checkbox">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          {kind === "refund"
            ? "我已核實實際退款完成（此處只作登記）"
            : kind === "reverse"
              ? "我已核對原核銷，確認退回一次套票並將預約還原為已到店"
              : "我確認作廢此張未付款訂單"}
        </label>
      </FormFrame>
    </Modal>
  );
}
function Receipt({ order: o, onClose }: { order: Order; onClose: () => void }) {
  const { pos, identity, customerName, open, customerDetails } = usePos(),
    t = orderTotals(pos, o),
    payments = pos.payments.filter((p) => p.orderId === o.id),
    refunds = pos.refunds.filter((r) => r.orderId === o.id);
  return (
    <Modal title="訂單明細" subtitle={o.number} onClose={onClose} wide>
      <div className="sv-receipt sv-print-root">
        <header>
          <span className="sv-receipt-brand">
            Smart<span>Volt</span>
          </span>
          <div>
            <strong>
              {identity.scope.brands.find((b) => b.id === o.brandId)?.name}
            </strong>
            <small>
              {identity.connected
                ? "訂單及人工核實收款記錄"
                : "示範訂單 · 無真實款項"}
            </small>
          </div>
        </header>
        <div className="sv-receipt-summary">
          <div>
            <small>客戶</small>
            <strong>{customerName(o.contactId)}</strong>
            <small>
              {hkDate(o.createdAt)} {hkTime(o.createdAt)} HKT
            </small>
          </div>
          <div>
            <strong>{o.number}</strong>
            <span className="sv-status sv-status-pending">{t.status}</span>
          </div>
        </div>
        <table className="sv-table">
          <thead>
            <tr>
              <th>項目</th>
              <th>數量</th>
              <th>金額</th>
            </tr>
          </thead>
          <tbody>
            {o.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.name}
                  <small>{money(l.unitCents)} / 項</small>
                </td>
                <td>{l.quantity}</td>
                <td>{money(l.unitCents * l.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="sv-receipt-totals">
          <div>
            <dt>小計 / 折扣</dt>
            <dd>
              {money(t.subtotal)} / −{money(o.discountCents)}
            </dd>
          </div>
          <div>
            <dt>應收總額</dt>
            <dd>{money(t.total)}</dd>
          </div>
          <div>
            <dt>累計已收 / 已退</dt>
            <dd>
              {money(t.paid)} / {money(t.refunded)}
            </dd>
          </div>
          <div>
            <dt>實收淨額</dt>
            <dd>{money(t.net)}</dd>
          </div>
          <div>
            <dt>尚欠尾數</dt>
            <dd>{money(t.due)}</dd>
          </div>
        </dl>
        <h4>收款與退款記錄</h4>
        {[
          ...payments.map((p) => ({ ...p, entryKind: "payment" })),
          ...refunds.map((r) => ({ ...r, entryKind: "refund" })),
        ]
          .sort((a, b) => a.at - b.at)
          .map((p) => (
            <div className="sv-ledger-entry" key={p.id}>
              <span>
                {p.entryKind === "refund" ? "退款" : "收款"} · {hkDate(p.at)}{" "}
                {hkTime(p.at)}
                <small>
                  {p.actor} ·{" "}
                  {"method" in p
                    ? `${p.method === "fps" ? "轉數快" : p.method === "cash" ? "現金" : "信用卡"} ${p.reference}`
                    : p.reason}
                </small>
              </span>
              <strong>
                {p.entryKind === "refund" ? "−" : "+"}
                {money(p.amountCents)}
              </strong>
            </div>
          ))}
        {!payments.length && <p className="sv-caption">尚未有核實收款。</p>}
        <p className="sv-receipt-note">
          此明細列出人工核實入帳記錄。完成服務、收取款項及套票核銷分開處理。
        </p>
      </div>
      <div className="sv-receipt-actions">
        <button className="sv-secondary" onClick={() => window.print()}>
          <Printer size={15} />
          列印明細
        </button>
        <button
          className="sv-secondary"
          onClick={() => customerDetails(o.contactId, o.brandId)}
        >
          <UserRound size={15} />
          客戶資料
        </button>
        {["owner", "manager"].includes(identity.actor.role) && t.net > 0 && (
          <button
            className="sv-secondary"
            onClick={() => open({ kind: "refund", id: o.id })}
          >
            <RotateCcw size={15} />
            登記退款
          </button>
        )}
        {t.due > 0 && !o.voided && t.refunded === 0 && (
          <button
            className="sv-primary"
            onClick={() => open({ kind: "payment", id: o.id })}
          >
            登記尾數
          </button>
        )}
      </div>
    </Modal>
  );
}
function CatalogForm({
  item,
  onClose,
}: {
  item?: CatalogItem;
  onClose: () => void;
}) {
  const { pos, brand, run } = usePos();
  const [value, setValue] = useState<CatalogItem>(
    item ?? {
      id: newId(),
      brandId: brand,
      name: "",
      kind: "service",
      category: "護理服務",
      priceCents: 0,
      durationMinutes: 60,
      bufferMinutes: 15,
      resourceKind: "bed",
      serviceId: null,
      units: 10,
      validDays: 180,
      active: true,
    },
  );
  const [price, setPrice] = useState(item ? String(item.priceCents / 100) : ""),
    [error, setError] = useState("");
  const patch = (p: Partial<CatalogItem>) => setValue((v) => ({ ...v, ...p }));
  return (
    <Modal
      title={item ? "編輯價目" : "新增服務／套票／商品"}
      subtitle="每張訂單保留成交時嘅價錢、名稱同套票條款。"
      onClose={onClose}
    >
      <FormFrame
        onClose={onClose}
        error={error}
        submit="儲存價目"
        onSubmit={(e) => {
          e.preventDefault();
          const cents = parseMoney(price);
          if (cents === null || cents <= 0) {
            setError("請填入有效售價，最多兩個小數位。");
            return;
          }
          if (
            run(
              {
                kind: "catalog-save",
                id: newId(),
                item: {
                  ...value,
                  priceCents: cents,
                  serviceId: value.kind === "package" ? value.serviceId : null,
                },
              },
              "價目已儲存。",
            )
          )
            onClose();
          else setError("請檢查項目設定，套票需要連結同品牌嘅服務。");
        }}
      >
        <div className="sv-form-grid">
          <label>
            項目類型
            <select
              aria-label="價目類型"
              disabled={!!item}
              value={value.kind}
              onChange={(e) =>
                patch({ kind: e.target.value as CatalogItem["kind"] })
              }
            >
              <option value="service">服務</option>
              <option value="package">套票</option>
              <option value="product">商品</option>
            </select>
          </label>
          <label>
            分類
            <input
              aria-label="價目分類"
              required
              maxLength={40}
              value={value.category}
              onChange={(e) => patch({ category: e.target.value })}
            />
          </label>
        </div>
        <label>
          項目名稱
          <input
            aria-label="價目名稱"
            required
            maxLength={100}
            value={value.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <label>
          售價（HKD）
          <input
            aria-label="價目售價"
            required
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        {value.kind === "service" && (
          <>
            <div className="sv-form-grid">
              <label>
                服務時間（分鐘）
                <input
                  aria-label="服務時間分鐘"
                  type="number"
                  min="5"
                  max="480"
                  required
                  value={value.durationMinutes}
                  onChange={(e) =>
                    patch({ durationMinutes: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                整理緩衝（分鐘）
                <input
                  aria-label="整理緩衝分鐘"
                  type="number"
                  min="0"
                  max="120"
                  required
                  value={value.bufferMinutes}
                  onChange={(e) =>
                    patch({ bufferMinutes: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label>
              所需場地
              <select
                aria-label="服務所需場地"
                value={value.resourceKind}
                onChange={(e) =>
                  patch({
                    resourceKind: e.target.value as CatalogItem["resourceKind"],
                  })
                }
              >
                <option value="bed">護理床</option>
                <option value="room">房間</option>
                <option value="studio">訓練空間</option>
                <option value="none">毋須場地</option>
              </select>
            </label>
          </>
        )}
        {value.kind === "package" && (
          <>
            <label>
              適用服務
              <select
                aria-label="套票適用服務"
                required
                value={value.serviceId ?? ""}
                onChange={(e) => patch({ serviceId: e.target.value })}
              >
                <option value="">選擇服務…</option>
                {pos.catalog
                  .filter((i) => i.brandId === brand && i.kind === "service")
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="sv-form-grid">
              <label>
                可用次數
                <input
                  aria-label="套票可用次數"
                  type="number"
                  required
                  min="1"
                  max="200"
                  value={value.units}
                  onChange={(e) => patch({ units: Number(e.target.value) })}
                />
              </label>
              <label>
                有效日數
                <input
                  aria-label="套票有效日數"
                  type="number"
                  required
                  min="1"
                  max="3650"
                  value={value.validDays}
                  onChange={(e) => patch({ validDays: Number(e.target.value) })}
                />
              </label>
            </div>
          </>
        )}
        <label className="sv-checkbox">
          <input
            type="checkbox"
            checked={value.active}
            onChange={(e) => patch({ active: e.target.checked })}
          />
          上架供預約／收銀使用
        </label>
      </FormFrame>
    </Modal>
  );
}
function ResourceForm({
  resource,
  onClose,
}: {
  resource?: Resource;
  onClose: () => void;
}) {
  const { brand, run } = usePos();
  const [v, setValue] = useState<Resource>(
      resource ?? {
        id: newId(),
        brandId: brand,
        name: "",
        kind: "bed",
        capacity: 1,
        active: true,
      },
    ),
    [error, setError] = useState("");
  return (
    <Modal
      title={resource ? "編輯預約資源" : "新增預約資源"}
      subtitle="床位、房間同訓練空間，使用同一套容量檢查。"
      onClose={onClose}
    >
      <FormFrame
        onClose={onClose}
        error={error}
        submit="儲存資源"
        onSubmit={(e) => {
          e.preventDefault();
          if (run({ kind: "resource-save", id: newId(), resource: v }))
            onClose();
          else setError("未能修改資源。請先處理現有預約，並檢查容量設定。");
        }}
      >
        <label>
          資源名稱
          <input
            aria-label="資源名稱"
            required
            maxLength={80}
            value={v.name}
            onChange={(e) => setValue({ ...v, name: e.target.value })}
          />
        </label>
        <div className="sv-form-grid">
          <label>
            資源類型
            <select
              aria-label="資源類型"
              value={v.kind}
              onChange={(e) =>
                setValue({ ...v, kind: e.target.value as Resource["kind"] })
              }
            >
              <option value="bed">護理床</option>
              <option value="room">房間</option>
              <option value="studio">訓練空間</option>
            </select>
          </label>
          <label>
            同時容納人數
            <input
              aria-label="資源容量"
              type="number"
              min="1"
              max="30"
              required
              value={v.capacity}
              onChange={(e) =>
                setValue({ ...v, capacity: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <label className="sv-checkbox">
          <input
            type="checkbox"
            checked={v.active}
            onChange={(e) => setValue({ ...v, active: e.target.checked })}
          />
          開放預約
        </label>
      </FormFrame>
    </Modal>
  );
}

function CustomerDetail({
  id,
  brandId,
  onClose,
}: {
  id: string;
  brandId?: string;
  onClose: () => void;
}) {
  const { workspace, pos, brand, checkout, open } = usePos(),
    contact = workspace.state.inbox.contacts.find((c) => c.id === id),
    scope = brandId ?? brand;
  if (!contact) return null;
  const packs = pos.entitlements.filter(
      (p) => p.contactId === id && p.brandId === scope,
    ),
    appointments = pos.appointments
      .filter((a) => a.contactId === id && a.brandId === scope)
      .toSorted((a, b) => b.startsAt - a.startsAt),
    orders = pos.orders
      .filter((o) => o.contactId === id && o.brandId === scope)
      .toReversed();
  return (
    <Modal
      title="POS 客戶資料"
      subtitle="客戶資料、服務記錄與套票"
      onClose={onClose}
      wide
    >
      <div className="sv-pos-profile">
        <div className="sv-customer-meta">
          <span className="sv-avatar">{contact.name.slice(0, 1)}</span>
          <div>
            <h3>{contact.name}</h3>
            <p>{contact.phone}</p>
          </div>
        </div>
        {contact.note && <p className="sv-pos-profile-note">{contact.note}</p>}
        <h4>持有套票</h4>
        {packs.map((p) => (
          <div className="sv-pos-profile-row" key={p.id}>
            <span>
              {p.name}
              <small>
                {hkDate(p.expiresAt)} 到期 · {p.revoked ? "已停用" : "持有中"}
              </small>
            </span>
            <strong>
              {remainingUnits(pos, p.id)} / {p.units} 次
            </strong>
          </div>
        ))}
        {!packs.length && <p className="sv-caption">暫未持有套票</p>}
        <h4>到店及預約</h4>
        {appointments.map((a) => (
          <div className="sv-pos-profile-row" key={a.id}>
            <span>
              {a.serviceName}
              <small>
                {hkDate(a.startsAt)} {hkTime(a.startsAt)} ·{" "}
                {statusLabels[a.status]}
              </small>
            </span>
            <button
              onClick={() => open({ kind: "appointment-detail", id: a.id })}
            >
              預約詳情
            </button>
          </div>
        ))}
        {!appointments.length && <p className="sv-caption">暫未有預約</p>}
        <h4>消費記錄</h4>
        {orders.map((o) => (
          <div className="sv-pos-profile-row" key={o.id}>
            <span>
              {o.number}
              <small>
                {hkDate(o.createdAt)} · {orderTotals(pos, o).status}
              </small>
            </span>
            <button
              onClick={() => {
                onClose();
                checkout(undefined, o);
              }}
            >
              {money(orderTotals(pos, o).total)}
            </button>
          </div>
        ))}
        {!orders.length && <p className="sv-caption">暫未有消費記錄</p>}
      </div>
    </Modal>
  );
}
