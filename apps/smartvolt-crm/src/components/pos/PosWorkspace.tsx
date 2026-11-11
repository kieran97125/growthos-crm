"use client";
import { lazy, Suspense, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Gift,
  LayoutDashboard,
  MessageSquare,
  Minus,
  Package,
  Plus,
  ReceiptText,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { actionTime } from "@/components/crm/conversations/events";
import { useDemo } from "@/lib/demo/Provider";
import { useIdentity } from "@/lib/saas/CompanyProvider";
import {
  applyPosCommand,
  dailyMetrics,
  orderTotals,
  remainingUnits,
} from "@/lib/pos/engine";
import {
  emptyPos,
  type Appointment,
  type Order,
  type PosCommand,
} from "@/lib/pos/model";
import { hkDate, hkTime, money } from "@/lib/pos/money";
import {
  Dialog,
  newId,
  PosContext,
  Section,
  statusLabels,
  kindLabels,
  usePos,
} from "./context";
import PosDialogs from "./PosDialogs";
import "./pos.css";
const PosCalendar = lazy(() => import("./PosCalendar"));
const sections = [
  { id: "today", name: "今日營運", icon: LayoutDashboard },
  { id: "calendar", name: "預約日曆", icon: CalendarDays },
  { id: "cashier", name: "收銀台", icon: ShoppingBag },
  { id: "packages", name: "套票會員", icon: Gift },
  { id: "transactions", name: "交易記錄", icon: ReceiptText },
  { id: "settings", name: "服務設定", icon: Settings2 },
] as const;
export type PosOpenContext = {
  contactId: string;
  brandId: string;
  token: string;
};
export default function PosWorkspace({
  onCRM,
  context,
  active,
}: {
  onCRM: (id?: string, brandId?: string) => void;
  context: PosOpenContext | null;
  active: boolean;
}) {
  const workspace = useDemo(),
    identity = useIdentity();
  const pos = workspace.state.pos ?? emptyPos(identity.scope.companyId);
  const cartRef = useRef<HTMLElement>(null);
  const [section, setSection] = useState<Section>(
    context ? "cashier" : "today",
  );
  const [brand, setBrand] = useState(
    context?.brandId ?? identity.scope.brands[0].id,
  );
  const [customer, setCustomerId] = useState(context?.contactId ?? "");
  const [seenContext, setSeenContext] = useState(context?.token);
  const [date, setDate] = useState(hkDate(workspace.now));
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [staff, setStaff] = useState("all");
  if (context?.token !== seenContext) {
    setSeenContext(context?.token);
    if (context) {
      setBrand(context.brandId);
      setCustomerId(context.contactId);
      setSection("cashier");
      setOrderId("");
      setSearch("");
    }
  }
  const customerName = (id: string) =>
    workspace.state.inbox.contacts.find((c) => c.id === id)?.name ??
    "未命名客戶";
  function run(command: PosCommand, message = "已更新 POS 記錄。") {
    try {
      applyPosCommand(pos, command, {
        companyId: identity.scope.companyId,
        brandIds: identity.scope.brands.map((b) => b.id),
        staffIds: identity.scope.team.map((t) => t.id),
        contacts: workspace.state.inbox.contacts,
        conversations: workspace.state.inbox.conversations,
        actor: identity.actor,
        now: actionTime(),
      });
      workspace.dispatch({ type: "pos", command });
      setError("");
      setNotice(message);
      return true;
    } catch (err) {
      setNotice("");
      setError(err instanceof Error ? err.message : "未能儲存此操作。");
      return false;
    }
  }
  function setCustomer(id: string) {
    setCustomerId(id);
    setOrderId("");
  }
  function checkout(appointment?: Appointment, order?: Order) {
    setSection("cashier");
    setDialog(null);
    setSearch("");
    if (order) {
      setBrand(order.brandId);
      setCustomerId(order.contactId);
      setOrderId(order.id);
      return;
    }
    if (appointment) {
      setBrand(appointment.brandId);
      setCustomerId(appointment.contactId);
      const existing = pos.orders.find(
        (o) => o.appointmentId === appointment.id && !o.voided,
      );
      if (existing) {
        setOrderId(existing.id);
        return;
      }
      const id = newId();
      if (
        run(
          {
            kind: "cart-add",
            id: newId(),
            orderId: id,
            contactId: appointment.contactId,
            itemId: appointment.serviceId,
            appointmentId: appointment.id,
          },
          "預約已帶入收銀台。",
        )
      )
        setOrderId(id);
    }
  }
  const ui = {
    workspace,
    identity,
    pos,
    brand,
    customer,
    setCustomer,
    date,
    run,
    open: setDialog,
    crm: onCRM,
    checkout,
    customerName,
  };
  const metrics = dailyMetrics(pos, date, brand),
    selectedSection = sections.find((s) => s.id === section)!;
  const selectedOrder = pos.orders.find((o) => o.id === orderId);
  const contacts = workspace.state.inbox.contacts.filter((c) =>
    workspace.state.inbox.conversations.some(
      (cv) => cv.contactId === c.id && cv.brandId === brand,
    ),
  );
  const customerPacks = pos.entitlements.filter(
    (p) =>
      p.contactId === customer &&
      p.brandId === brand &&
      !p.revoked &&
      p.expiresAt > workspace.now &&
      remainingUnits(pos, p.id) > 0,
  );
  const shiftDate = (n: number) =>
    setDate(
      hkDate(new Date(`${date}T12:00:00+08:00`).getTime() + n * 86400000),
    );
  return (
    <PosContext.Provider value={ui}>
      <section className="sv-pos" aria-label="POS 營運工作台">
        <header className="sv-pos-header">
          <div className="sv-pos-title">
            <span className="sv-pos-symbol">
              <Store size={22} />
            </span>
            <div>
              <span className="sv-eyebrow">SMARTVOLT · OPERATIONS</span>
              <h1>POS 營運工作台</h1>
            </div>
            <span className="sv-live-dot">
              {identity.connected ? "公司工作空間" : "互動示範"}
            </span>
          </div>
          <div className="sv-header-actions">
            <label className="sv-brand-select">
              <Store size={14} />
              <select
                aria-label="POS 品牌"
                value={brand}
                onChange={(e) => {
                  setBrand(e.target.value);
                  setCustomer("");
                  setSearch("");
                }}
              >
                {identity.scope.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="sv-secondary sv-crm-return"
              onClick={() => onCRM(customer || undefined, brand)}
            >
              <MessageSquare size={15} />
              返回 CRM
              <ArrowRight size={15} />
            </button>
          </div>
        </header>
        <div className="sv-pos-navline">
          <nav className="sv-pos-tabs" aria-label="POS 工作區">
            {sections.map((s) => (
              <button
                key={s.id}
                aria-current={s.id === section ? "page" : undefined}
                onClick={() => {
                  setSection(s.id);
                  setSearch("");
                  setFilter("all");
                }}
              >
                <s.icon size={16} />
                {s.name}
                {s.id === "today" && (
                  <span>
                    {
                      metrics.appointments.filter(
                        (a) => !["cancelled", "no_show"].includes(a.status),
                      ).length
                    }
                  </span>
                )}
              </button>
            ))}
          </nav>
          <span className="sv-hkt">香港時間 HKT</span>
        </div>
        {(notice || error) && (
          <div
            className={`sv-notice ${error ? "is-error" : ""}`}
            role={error ? "alert" : "status"}
          >
            <span>{error || notice}</span>
            <button
              aria-label="關閉 POS 提示"
              onClick={() => {
                setError("");
                setNotice("");
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="sv-pos-body">
          <div className="sv-page-heading">
            <div>
              <span className="sv-eyebrow">
                {identity.scope.brands.find((b) => b.id === brand)?.name} / POS
              </span>
              <h2>{selectedSection.name}</h2>
              <p>
                {
                  {
                    today: "由預約到回訪，讓每一次到店都有下一步。",
                    calendar: "同事、床位與緩衝時間，一次安排好。",
                    cashier: "客戶、服務同套票，喺同一張訂單處理。",
                    packages: "清楚掌握每位客戶嘅剩餘次數同到期日。",
                    transactions: "每筆收款、退款同更正，都有記錄可追溯。",
                    settings: "為你嘅服務節奏，設定價目同可用資源。",
                  }[section]
                }
              </p>
            </div>
            <div className="sv-heading-actions">
              {(section === "today" || section === "calendar") && (
                <>
                  <div className="sv-date-control">
                    <button
                      aria-label="POS 上一天"
                      onClick={() => shiftDate(-1)}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <input
                      type="date"
                      aria-label="POS 營運日期"
                      value={date}
                      onChange={(e) => {
                        if (e.target.value) setDate(e.target.value);
                      }}
                    />
                    <button
                      aria-label="POS 下一天"
                      onClick={() => shiftDate(1)}
                    >
                      <ChevronRight size={15} />
                    </button>
                    <button onClick={() => setDate(hkDate(Date.now()))}>
                      今日
                    </button>
                  </div>
                  <button
                    className="sv-primary"
                    onClick={() => setDialog({ kind: "appointment" })}
                  >
                    <Plus size={16} />
                    新增預約
                  </button>
                </>
              )}
              {section === "cashier" && (
                <button
                  className="sv-secondary"
                  onClick={() => {
                    setOrderId("");
                    setNotice("已開新單，原有訂單仍可喺交易記錄繼續處理。");
                  }}
                >
                  <Plus size={15} />
                  開新單
                </button>
              )}
            </div>
          </div>
          {section === "today" && (
            <>
              <div className="sv-metrics">
                <Metric
                  label="今日預約"
                  value={String(
                    metrics.appointments.filter(
                      (a) => !["cancelled", "no_show"].includes(a.status),
                    ).length,
                  )}
                  detail={`${metrics.arrived} 位已到店／完成`}
                  icon={<CalendarDays size={18} />}
                />
                <Metric
                  label="今日實收淨額"
                  value={money(metrics.net)}
                  detail={`收款 ${money(metrics.received)} · 退款 ${money(metrics.refunds)}`}
                  icon={<Wallet size={18} />}
                />
                <Metric
                  label="待收尾數"
                  value={money(metrics.due)}
                  detail="所有未作廢訂單 · 按原訂單金額"
                  icon={<CreditCard size={18} />}
                />
                <Metric
                  label="今日套票核銷"
                  value={`${metrics.redemptions} 次`}
                  detail="扣除撤銷 · 與收款分開計算"
                  icon={<Gift size={18} />}
                />
              </div>
              <div className="sv-overview-grid">
                <div className="sv-card">
                  <div className="sv-card-head">
                    <div>
                      <h3>到店安排</h3>
                      <p>{date} · 服務與客戶跟進</p>
                    </div>
                    <button
                      className="sv-text-button"
                      onClick={() => setSection("calendar")}
                    >
                      開啟日曆
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="sv-filter-row">
                    <div className="sv-segment" aria-label="預約狀態篩選">
                      {[
                        ["all", "全部"],
                        ["confirmed", "待到店"],
                        ["checked_in", "服務中"],
                        ["pending", "待確認"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          aria-pressed={filter === id}
                          onClick={() => setFilter(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="sv-search">
                      <Search size={15} />
                      <input
                        aria-label="搜尋今日預約"
                        placeholder="搜尋客戶、服務…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <Appointments
                    rows={metrics.appointments
                      .filter(
                        (a) =>
                          (filter === "all" || a.status === filter) &&
                          `${customerName(a.contactId)} ${a.serviceName}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .sort((a, b) => a.startsAt - b.startsAt)}
                  />
                </div>
                <aside className="sv-overview-side">
                  <div className="sv-growth-card">
                    <span className="sv-growth-icon">
                      <Sparkles size={22} />
                    </span>
                    <span className="sv-eyebrow">NEXT BEST FOLLOW-UP</span>
                    <h3>服務完成，關係繼續。</h3>
                    <p>睇返客戶對話、到店記錄同剩餘套票，再安排合適嘅回訪。</p>
                    <button onClick={() => onCRM(customer || undefined, brand)}>
                      前往 CRM 跟進
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="sv-card sv-followups">
                    <div className="sv-card-head">
                      <h3>套票到期關注</h3>
                      <Gift size={16} />
                    </div>
                    {pos.entitlements
                      .filter(
                        (p) =>
                          p.brandId === brand &&
                          !p.revoked &&
                          remainingUnits(pos, p.id) > 0,
                      )
                      .sort((a, b) => a.expiresAt - b.expiresAt)
                      .slice(0, 3)
                      .map((p) => (
                        <button
                          className="sv-followup"
                          key={p.id}
                          onClick={() => onCRM(p.contactId, p.brandId)}
                        >
                          <span className="sv-avatar">
                            {customerName(p.contactId).slice(0, 1)}
                          </span>
                          <span>
                            <strong>{customerName(p.contactId)}</strong>
                            <small>
                              {hkDate(p.expiresAt)} 到期 · 尚餘{" "}
                              {remainingUnits(pos, p.id)} 次
                            </small>
                          </span>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                    <button
                      className="sv-text-button"
                      onClick={() => setSection("packages")}
                    >
                      查看套票會員
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </aside>
              </div>
            </>
          )}
          {section === "calendar" && (
            <div className="sv-card sv-calendar-card">
              <div className="sv-card-head">
                <div className="sv-calendar-legend">
                  <span>
                    <i />
                    已確認
                  </span>
                  <span>
                    <i className="sv-green" />
                    已到店／完成
                  </span>
                  <span>
                    <i className="sv-amber" />
                    待確認
                  </span>
                </div>
                <label>
                  負責同事{" "}
                  <select
                    aria-label="日曆負責同事"
                    value={staff}
                    onChange={(e) => setStaff(e.target.value)}
                  >
                    <option value="all">所有同事</option>
                    {identity.scope.team.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Suspense
                fallback={<div className="sv-empty">載入預約日曆…</div>}
              >
                <PosCalendar
                  date={date}
                  onDate={setDate}
                  active={active}
                  staff={staff}
                />
              </Suspense>
            </div>
          )}
          {section === "cashier" && (
            <div className="sv-cashier-grid">
              <section className="sv-card sv-catalog">
                <div className="sv-card-head">
                  <h3>服務與商品</h3>
                  <span className="sv-caption">選擇項目加入訂單</span>
                </div>
                <div className="sv-mobile-customer">
                  <label>
                    收銀客戶
                    <select
                      aria-label="手機收銀客戶"
                      value={customer}
                      onChange={(e) => setCustomer(e.target.value)}
                    >
                      <option value="">選擇客戶…</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.phone}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="sv-text-button"
                    onClick={() => setDialog({ kind: "customer" })}
                  >
                    <Plus size={13} />
                    新增
                  </button>
                </div>
                <div className="sv-filter-row">
                  <div className="sv-segment">
                    {[
                      ["all", "全部"],
                      ["service", "服務"],
                      ["package", "套票"],
                      ["product", "商品"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        aria-pressed={filter === id}
                        onClick={() => setFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="sv-search">
                    <Search size={15} />
                    <input
                      aria-label="搜尋收銀項目"
                      placeholder="搜尋服務或套票…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                <div className="sv-catalog-grid">
                  {pos.catalog
                    .filter(
                      (i) =>
                        i.brandId === brand &&
                        i.active &&
                        (filter === "all" || i.kind === filter) &&
                        i.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((item) => (
                      <button
                        className={`sv-product sv-product-${item.kind}`}
                        key={item.id}
                        disabled={
                          !customer ||
                          !!selectedOrder?.voided ||
                          (!!selectedOrder &&
                            orderTotals(pos, selectedOrder).paid > 0)
                        }
                        onClick={() => {
                          const id = selectedOrder?.id ?? newId();
                          if (
                            run(
                              {
                                kind: "cart-add",
                                id: newId(),
                                orderId: id,
                                contactId: customer,
                                itemId: item.id,
                                appointmentId:
                                  selectedOrder?.appointmentId ?? null,
                              },
                              "已加入訂單。",
                            )
                          )
                            setOrderId(id);
                        }}
                      >
                        <span className="sv-product-top">
                          <span className="sv-product-icon">
                            {item.kind === "package" ? (
                              <Gift size={24} />
                            ) : item.kind === "product" ? (
                              <Package size={24} />
                            ) : (
                              <Sparkles size={24} />
                            )}
                          </span>
                          <span className="sv-pill">
                            {kindLabels[item.kind]}
                          </span>
                        </span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.category} ·{" "}
                          {item.kind === "service"
                            ? `${item.durationMinutes} 分鐘`
                            : item.kind === "package"
                              ? `${item.units} 次 / ${item.validDays} 日有效`
                              : "零售商品"}
                        </small>
                        <span className="sv-product-bottom">
                          <b>{money(item.priceCents)}</b>
                          <span>
                            <Plus size={17} />
                          </span>
                        </span>
                      </button>
                    ))}
                </div>
                {!customer && (
                  <div className="sv-inline-hint">
                    <UsersRound size={16} />
                    先揀選或新增客戶，即可開始收銀。
                  </div>
                )}
              </section>
              <aside
                ref={cartRef}
                className="sv-card sv-cart"
                tabIndex={-1}
                aria-label="POS 收銀訂單"
              >
                <div className="sv-card-head">
                  <h3>
                    <ShoppingBag size={17} />
                    本次訂單
                  </h3>
                  <span className="sv-caption">
                    {selectedOrder?.number ?? "尚未建立"}
                  </span>
                </div>
                <div className="sv-cart-customer">
                  <label>
                    收銀客戶
                    <select
                      aria-label="收銀客戶"
                      value={customer}
                      onChange={(e) => setCustomer(e.target.value)}
                    >
                      <option value="">選擇客戶…</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.phone}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="sv-text-button"
                    onClick={() => setDialog({ kind: "customer" })}
                  >
                    <Plus size={13} />
                    新增客戶
                  </button>
                  {customer && (
                    <button
                      className="sv-text-button"
                      onClick={() => onCRM(customer, brand)}
                    >
                      <MessageSquare size={13} />
                      查看客戶 CRM
                    </button>
                  )}
                </div>
                {customerPacks.length > 0 && (
                  <div className="sv-cart-package">
                    <Gift size={17} />
                    <span>客戶有 {customerPacks.length} 張可用套票</span>
                    <button onClick={() => setSection("packages")}>查看</button>
                  </div>
                )}
                {selectedOrder?.appointmentId && (
                  <div className="sv-cart-linked">
                    <CalendarDays size={14} />
                    已連結預約 ·{" "}
                    {hkTime(
                      pos.appointments.find(
                        (a) => a.id === selectedOrder.appointmentId,
                      )!.startsAt,
                    )}
                  </div>
                )}
                <Cart order={selectedOrder} />
              </aside>
            </div>
          )}
          {section === "packages" && (
            <Packages
              search={search}
              setSearch={setSearch}
              filter={filter}
              setFilter={setFilter}
            />
          )}
          {section === "transactions" && (
            <Transactions
              search={search}
              setSearch={setSearch}
              filter={filter}
              setFilter={setFilter}
            />
          )}
          {section === "settings" && <Settings />}
          <footer className="sv-pos-footer">
            <span>
              <span className="sv-save-dot" />
              {workspace.storage}
            </span>
            <span>
              {identity.connected
                ? "人工核實入帳 · 未接收單服務"
                : "示範資料 · 不會處理真實款項"}
            </span>
          </footer>
        </div>
        {section === "cashier" && (
          <div className="sv-mobile-checkout">
            <div>
              <small>
                {customer ? customerName(customer) : "先選擇收銀客戶"} ·{" "}
                {selectedOrder?.lines.reduce((n, l) => n + l.quantity, 0) ?? 0}{" "}
                項
              </small>
              <strong>
                {money(selectedOrder ? orderTotals(pos, selectedOrder).due : 0)}
              </strong>
            </div>
            <button
              className="sv-primary"
              onClick={() => {
                cartRef.current?.scrollIntoView({
                  block: "start",
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "instant"
                    : "smooth",
                });
                cartRef.current?.focus({ preventScroll: true });
              }}
            >
              <ShoppingBag size={16} />
              查看訂單
              <ArrowRight size={14} />
            </button>
          </div>
        )}
        {dialog && (
          <PosDialogs
            key={dialog.kind + ("id" in dialog ? dialog.id : "")}
            dialog={dialog}
            onClose={() => setDialog(null)}
          />
        )}
      </section>
    </PosContext.Provider>
  );
}
function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="sv-metric">
      <div>
        <span>{label}</span>
        <span className="sv-metric-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
export function Appointments({ rows }: { rows: Appointment[] }) {
  const { pos, identity, open, run, crm, checkout, customerName } = usePos();
  if (!rows.length)
    return (
      <div className="sv-empty">
        <CalendarDays size={30} />
        <h3>呢個時段仲有空間</h3>
        <p>建立預約，為下一位客戶安排服務。</p>
        <button
          className="sv-secondary"
          onClick={() => open({ kind: "appointment" })}
        >
          新增預約
        </button>
      </div>
    );
  return (
    <div className="sv-table-wrap">
      <table className="sv-table sv-appointments">
        <thead>
          <tr>
            <th>時間</th>
            <th>客戶 / 服務</th>
            <th>同事 / 資源</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>
                <strong>{hkTime(a.startsAt)}</strong>
                <small>– {hkTime(a.endsAt)}</small>
              </td>
              <td>
                <button
                  className="sv-customer-link"
                  onClick={() => open({ kind: "appointment-detail", id: a.id })}
                >
                  <span className="sv-avatar">
                    {customerName(a.contactId).slice(0, 1)}
                  </span>
                  <span>
                    <strong>{customerName(a.contactId)}</strong>
                    <small>{a.serviceName}</small>
                  </span>
                </button>
              </td>
              <td>
                {identity.scope.team.find((t) => t.id === a.staffId)?.name}
                <small>
                  {pos.resources.find((r) => r.id === a.resourceId)?.name ??
                    "毋須場地"}
                </small>
              </td>
              <td>
                <span className={`sv-status sv-status-${a.status}`}>
                  {statusLabels[a.status]}
                </span>
              </td>
              <td>
                <div className="sv-row-actions">
                  {a.status === "confirmed" && (
                    <button
                      className="sv-secondary"
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
                      到店
                    </button>
                  )}
                  {a.status === "pending" && (
                    <button
                      className="sv-secondary"
                      onClick={() =>
                        run(
                          {
                            kind: "appointment-status",
                            id: newId(),
                            appointmentId: a.id,
                            status: "confirmed",
                          },
                          "預約已由同事確認。",
                        )
                      }
                    >
                      確認
                    </button>
                  )}
                  {["confirmed", "checked_in"].includes(a.status) && (
                    <button
                      className="sv-text-button"
                      onClick={() => checkout(a)}
                    >
                      收銀
                    </button>
                  )}
                  <button
                    className="sv-icon-button"
                    aria-label={`查看 ${customerName(a.contactId)} CRM`}
                    onClick={() => crm(a.contactId, a.brandId)}
                  >
                    <MessageSquare size={15} />
                  </button>
                  <button
                    className="sv-icon-button"
                    aria-label={`查看 ${customerName(a.contactId)} 預約`}
                    onClick={() =>
                      open({ kind: "appointment-detail", id: a.id })
                    }
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Cart({ order }: { order?: Order }) {
  const { pos, run, open, identity } = usePos();
  const t = order
    ? orderTotals(pos, order)
    : { subtotal: 0, total: 0, paid: 0, due: 0, refunded: 0, status: "未收款" };
  const locked = !!order && (order.voided || t.paid > 0);
  return (
    <>
      <div className="sv-cart-lines">
        {order?.lines.length ? (
          order.lines.map((l) => (
            <div className="sv-cart-line" key={l.id}>
              <div>
                <strong>{l.name}</strong>
                <small>
                  {money(l.unitCents)} / {l.kind === "package" ? "套" : "項"}
                </small>
              </div>
              <div className="sv-quantity">
                <button
                  disabled={locked}
                  aria-label={`減少 ${l.name}`}
                  onClick={() =>
                    run({
                      kind: "cart-quantity",
                      id: newId(),
                      orderId: order.id,
                      lineId: l.id,
                      quantity: l.quantity - 1,
                    })
                  }
                >
                  <Minus size={12} />
                </button>
                <span>{l.quantity}</span>
                <button
                  disabled={locked || l.quantity >= 50}
                  aria-label={`增加 ${l.name}`}
                  onClick={() =>
                    run({
                      kind: "cart-quantity",
                      id: newId(),
                      orderId: order.id,
                      lineId: l.id,
                      quantity: l.quantity + 1,
                    })
                  }
                >
                  <Plus size={12} />
                </button>
              </div>
              <b>{money(l.unitCents * l.quantity)}</b>
            </div>
          ))
        ) : (
          <div className="sv-empty sv-empty-cart">
            <ShoppingBag size={34} />
            <h3>開始一張新訂單</h3>
            <p>從左邊加入服務、商品或套票。</p>
          </div>
        )}
      </div>
      <div className="sv-cart-totals">
        <div>
          <span>項目小計</span>
          <b>{money(t.subtotal)}</b>
        </div>
        <div>
          <span>訂單折扣</span>
          {order &&
          !locked &&
          ["owner", "manager"].includes(identity.actor.role) ? (
            <Discount order={order} />
          ) : (
            <b>− {money(order?.discountCents ?? 0)}</b>
          )}
        </div>
        <div className="sv-cart-total">
          <span>應收總額</span>
          <strong>{money(t.total)}</strong>
        </div>
        {t.paid > 0 && (
          <>
            <div>
              <span>累計已收</span>
              <b>{money(t.paid)}</b>
            </div>
            <div>
              <span>尚欠尾數</span>
              <b>{money(t.due)}</b>
            </div>
          </>
        )}
        {t.refunded > 0 && (
          <div>
            <span>已退款</span>
            <b>{money(t.refunded)}</b>
          </div>
        )}
        <button
          className="sv-primary sv-pay-button"
          disabled={
            !order?.lines.length ||
            !!order.voided ||
            t.due === 0 ||
            t.refunded > 0
          }
          onClick={() => order && open({ kind: "payment", id: order.id })}
        >
          <CreditCard size={18} />
          {t.paid > 0 ? "登記尾數" : "登記收款"}
          <span>{money(t.due)}</span>
        </button>
        <small>核實收款後入帳；套票付清後生效。</small>
        {order && (
          <div className="sv-cart-footer-actions">
            <button
              className="sv-text-button"
              disabled={!order.lines.length}
              onClick={() => open({ kind: "receipt", id: order.id })}
            >
              <ReceiptText size={14} />
              訂單明細
            </button>
            <button
              className="sv-text-button sv-danger-text"
              disabled={locked}
              onClick={() => open({ kind: "void", id: order.id })}
            >
              <Trash2 size={14} />
              作廢訂單
            </button>
          </div>
        )}
      </div>
    </>
  );
}
function Discount({ order }: { order: Order }) {
  const { run } = usePos();
  const [value, setValue] = useState(String(order.discountCents / 100));
  return (
    <form
      className="sv-discount"
      onSubmit={(e) => {
        e.preventDefault();
        const parts = value.split(".");
        if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) return;
        const cents =
          Number(parts[0]) * 100 + Number((parts[1] ?? "").padEnd(2, "0"));
        run({
          kind: "cart-discount",
          id: newId(),
          orderId: order.id,
          amountCents: cents,
        });
      }}
    >
      <span>$</span>
      <input
        aria-label="訂單折扣金額"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        pattern="[0-9]+(\.[0-9]{1,2})?"
      />
      <button aria-label="套用折扣" title="套用折扣">
        <Check size={13} />
      </button>
    </form>
  );
}
function Packages({
  search,
  setSearch,
  filter,
  setFilter,
}: {
  search: string;
  setSearch: (s: string) => void;
  filter: string;
  setFilter: (s: string) => void;
}) {
  const { pos, brand, customer, customerName, crm, workspace } = usePos();
  const now = workspace.now;
  const rows = pos.entitlements.filter(
    (p) =>
      p.brandId === brand &&
      `${customerName(p.contactId)} ${p.name}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter !== "customer" || p.contactId === customer),
  );
  return (
    <>
      <div className="sv-card">
        <div className="sv-filter-row">
          <div className="sv-segment">
            <button
              aria-pressed={filter !== "customer"}
              onClick={() => setFilter("all")}
            >
              全部會員
            </button>
            <button
              disabled={!customer}
              aria-pressed={filter === "customer"}
              onClick={() => setFilter("customer")}
            >
              所選客戶
            </button>
          </div>
          <label className="sv-search">
            <Search size={15} />
            <input
              aria-label="搜尋套票會員"
              placeholder="搜尋客戶或套票…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="sv-package-grid">
          {rows.map((p) => {
            const units = remainingUnits(pos, p.id),
              expired = p.expiresAt <= now;
            return (
              <article
                className={`sv-package-card ${p.revoked || expired ? "is-inactive" : ""}`}
                key={p.id}
              >
                <div className="sv-package-card-top">
                  <span className="sv-package-icon">
                    <Gift size={22} />
                  </span>
                  <span
                    className={`sv-pill ${p.revoked || expired ? "sv-pill-muted" : ""}`}
                  >
                    {p.revoked
                      ? "已退款停用"
                      : expired
                        ? "已到期"
                        : units === 0
                          ? "已用完"
                          : "使用中"}
                  </span>
                </div>
                <h3>{p.name}</h3>
                <button
                  className="sv-text-button"
                  onClick={() => crm(p.contactId, p.brandId)}
                >
                  {customerName(p.contactId)}
                  <ArrowRight size={13} />
                </button>
                <div className="sv-package-balance">
                  <strong>
                    {units}
                    <small> / {p.units} 次</small>
                  </strong>
                  <span>剩餘次數</span>
                </div>
                <progress
                  aria-label={`${customerName(p.contactId)} 套票剩餘次數`}
                  value={units}
                  max={p.units}
                />
                <footer>
                  <span>
                    <Clock3 size={13} />
                    {hkDate(p.expiresAt)} 到期
                  </span>
                  <button
                    className="sv-text-button"
                    onClick={() => crm(p.contactId, p.brandId)}
                  >
                    客戶 CRM
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
        {!rows.length && (
          <div className="sv-empty">
            <Gift size={32} />
            <h3>為客戶建立長期服務關係</h3>
            <p>收銀台出售嘅套票，付清後會自動喺呢度出現。</p>
          </div>
        )}
      </div>
      <div className="sv-inline-hint">
        <Gift size={16} />
        到店後，打開預約詳情揀選適用套票核銷；每次扣數同撤銷都會留底。
      </div>
    </>
  );
}
function Transactions({
  search,
  setSearch,
  filter,
  setFilter,
}: {
  search: string;
  setSearch: (s: string) => void;
  filter: string;
  setFilter: (s: string) => void;
}) {
  const { pos, brand, customerName, open, checkout } = usePos();
  const rows = pos.orders
    .filter(
      (o) =>
        o.brandId === brand &&
        o.lines.length &&
        `${o.number} ${customerName(o.contactId)}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter !== "due" || (!o.voided && orderTotals(pos, o).due > 0)) &&
        (filter !== "paid" || orderTotals(pos, o).due === 0) &&
        (filter !== "refund" || orderTotals(pos, o).refunded > 0),
    )
    .toReversed();
  return (
    <div className="sv-card">
      <div className="sv-filter-row">
        <div className="sv-segment">
          {[
            ["all", "全部訂單"],
            ["due", "待收款"],
            ["paid", "已付清"],
            ["refund", "退款"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="sv-search">
          <Search size={15} />
          <input
            aria-label="搜尋交易"
            placeholder="搜尋單號、客戶…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="sv-table-wrap">
        <table className="sv-table">
          <thead>
            <tr>
              <th>訂單</th>
              <th>客戶</th>
              <th>應收 / 實收淨額</th>
              <th>付款狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const t = orderTotals(pos, o);
              return (
                <tr key={o.id}>
                  <td>
                    <strong>{o.number}</strong>
                    <small>
                      {hkDate(o.createdAt)} · {hkTime(o.createdAt)}
                    </small>
                  </td>
                  <td>
                    {customerName(o.contactId)}
                    <small>{o.lines.map((l) => l.name).join("、")}</small>
                  </td>
                  <td>
                    <strong>{money(t.total)}</strong>
                    <small>實收淨額 {money(t.net)}</small>
                  </td>
                  <td>
                    <span
                      className={`sv-status ${t.refunded > 0 || o.voided ? "sv-status-cancelled" : t.due === 0 ? "sv-status-completed" : "sv-status-pending"}`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td>
                    <div className="sv-row-actions">
                      <button
                        className="sv-text-button"
                        onClick={() => open({ kind: "receipt", id: o.id })}
                      >
                        明細
                      </button>
                      {!o.voided && t.due > 0 && t.refunded === 0 && (
                        <button
                          className="sv-secondary"
                          onClick={() => checkout(undefined, o)}
                        >
                          繼續收銀
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="sv-empty">
          <ReceiptText size={32} />
          <h3>暫時未有符合嘅交易</h3>
          <p>收銀訂單會自動保留喺呢度。</p>
        </div>
      )}
    </div>
  );
}
function Settings() {
  const { pos, brand, open, identity } = usePos(),
    manager = ["owner", "manager"].includes(identity.actor.role);
  return (
    <div className="sv-settings-grid">
      <div className="sv-card">
        <div className="sv-card-head">
          <div>
            <h3>價目與服務</h3>
            <p>更新售價會套用到新訂單，舊單保留原價。</p>
          </div>
          <button
            className="sv-primary"
            disabled={!manager}
            onClick={() => open({ kind: "catalog" })}
          >
            <Plus size={15} />
            新增項目
          </button>
        </div>
        <div className="sv-table-wrap">
          <table className="sv-table">
            <thead>
              <tr>
                <th>名稱</th>
                <th>類型 / 時長</th>
                <th>售價</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pos.catalog
                .filter((i) => i.brandId === brand)
                .map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.name}</strong>
                      <small>{i.category}</small>
                    </td>
                    <td>
                      {kindLabels[i.kind]}
                      <small>
                        {i.kind === "service"
                          ? `${i.durationMinutes} 分鐘 · 緩衝 ${i.bufferMinutes} 分鐘`
                          : i.kind === "package"
                            ? `${i.units} 次 · ${i.validDays} 日`
                            : "零售商品"}
                      </small>
                    </td>
                    <td>{money(i.priceCents)}</td>
                    <td>
                      <span
                        className={`sv-status ${i.active ? "sv-status-completed" : "sv-status-cancelled"}`}
                      >
                        {i.active ? "已上架" : "已停用"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="sv-text-button"
                        disabled={!manager}
                        onClick={() => open({ kind: "catalog", item: i })}
                      >
                        編輯
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="sv-card">
        <div className="sv-card-head">
          <div>
            <h3>房間與資源</h3>
            <p>容量會連同預約時段一齊檢查。</p>
          </div>
          <button
            className="sv-secondary"
            disabled={!manager}
            onClick={() => open({ kind: "resource" })}
          >
            <Plus size={14} />
            新增資源
          </button>
        </div>
        <div className="sv-resource-list">
          {pos.resources
            .filter((r) => r.brandId === brand)
            .map((r) => (
              <button
                key={r.id}
                disabled={!manager}
                onClick={() => open({ kind: "resource", resource: r })}
              >
                <span className="sv-avatar">
                  <Store size={18} />
                </span>
                <span>
                  <strong>{r.name}</strong>
                  <small>
                    {r.kind === "bed"
                      ? "床位"
                      : r.kind === "room"
                        ? "房間"
                        : "訓練空間"}{" "}
                    · 容量 {r.capacity} 人 · {r.active ? "使用中" : "已停用"}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
