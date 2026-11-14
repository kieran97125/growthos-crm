"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowRight,
  Check,
  Clock3,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  stateNames,
  reasonNames,
  type EngagementPage,
  type Campaign,
  type MessageDefinition,
} from "@/lib/engagement/model";
import "./engagement.css";
import { engagementFetcher } from "./fetcher";
export function displayDate(d: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}
type Command = Record<string, unknown>;
export default function EngagementWorkspace({
  companyId,
  initial,
}: {
  companyId: string;
  initial?: EngagementPage;
}) {
  const [brand, setBrand] = useState(""),
    [cursor, setCursor] = useState(""),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState<Campaign | null>(null),
    [resultAfter, setResultAfter] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [frozen, setFrozen] = useState(false);
  const pending = useRef<Command | null>(null),
    dialog = useRef<HTMLDialogElement>(null),
    resultsDialog = useRef<HTMLDialogElement>(null);
  const endpoint = `/api/companies/${companyId}/engagement`,
    q = new URLSearchParams({
      ...(brand ? { brand } : {}),
      ...Object.fromEntries(new URLSearchParams(cursor)),
    });
  const {
    data,
    error: readError,
    mutate,
  } = useSWR<EngagementPage>(endpoint + "?" + q, engagementFetcher, {
    fallbackData: brand || cursor ? undefined : initial,
    refreshInterval: 15000,
    keepPreviousData: false,
  });
  const results = useSWR<EngagementPage>(
    selected
      ? endpoint +
          "?" +
          new URLSearchParams({
            campaign: selected.id,
            ...(resultAfter ? { after: resultAfter } : {}),
          })
      : null,
    engagementFetcher,
    { refreshInterval: 10000, keepPreviousData: false },
  );
  useEffect(() => {
    if (open && !dialog.current?.open) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLSelectElement>("select")?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (selected && !resultsDialog.current?.open)
      resultsDialog.current?.showModal();
  }, [selected]);
  async function send(command: Command) {
    if (busy) return;
    pending.current = command;
    setFrozen(true);
    setBusy(true);
    setError("");
    try {
      const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }),
        body = await r.json();
      if (!r.ok) {
        if (r.status < 500) {
          pending.current = null;
          setFrozen(false);
        }
        throw Error(body.error ?? "未能儲存。");
      }
      pending.current = null;
      setFrozen(false);
      dialog.current?.close();
      setOpen(false);
      setNotice(
        body.schedulerPending
          ? "排程已儲存，背景服務會接續處理。"
          : "已儲存。發送結果會持續更新。",
      );
      await mutate();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "暫時未能儲存，請核對同一請求。",
      );
    } finally {
      setBusy(false);
    }
  }
  function create() {
    setError("");
    setNotice("");
    setFrozen(false);
    pending.current = null;
    setOpen(true);
  }
  if (!data)
    return (
      <main className="eng-work">
        <h1>客戶訊息</h1>
        <p role={readError ? "alert" : "status"}>
          {readError?.message ?? "正在讀取排程…"}
        </p>
        <button onClick={() => void mutate()}>重新讀取</button>
      </main>
    );
  return (
    <main className="eng-work">
      <header className="eng-header">
        <div>
          <span className="eng-eyebrow">CUSTOMER ENGAGEMENT</span>
          <h1>客戶訊息</h1>
          <p>寫好一則訊息，喺合適時間送到合適客人。</p>
        </div>
        {data.canManage && (
          <button className="eng-primary" onClick={create}>
            <Plus size={18} />
            新增推播
          </button>
        )}
      </header>
      {(error || notice || readError) && (
        <p
          className={error || readError ? "eng-alert" : "eng-notice"}
          role={error || readError ? "alert" : "status"}
        >
          {error || readError?.message || notice}
        </p>
      )}
      {!open && frozen && (
        <button disabled={busy} onClick={() => void send(pending.current!)}>
          核對同一請求
        </button>
      )}
      <div className="eng-toolbar">
        <label>
          品牌
          <select
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setCursor("");
            }}
          >
            <option value="">全部品牌</option>
            {data.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="eng-icon"
          aria-label="重新讀取推播"
          onClick={() => void mutate()}
        >
          <RefreshCw size={17} />
        </button>
        <span>香港時間 · 自動更新</span>
      </div>
      {data.campaigns.length ? (
        <div className="eng-campaigns">
          {data.campaigns.map((c) => (
            <article className="eng-campaign" key={c.id}>
              <div className="eng-campaign-icon">
                <Send size={21} />
              </div>
              <div className="eng-campaign-main">
                <h2>{c.name}</h2>
                <p>
                  {c.channel === "whatsapp"
                    ? "WhatsApp"
                    : c.channel === "instagram"
                      ? "Instagram"
                      : "Messenger"}{" "}
                  · {c.purpose === "marketing" ? "營銷訊息" : "服務通知"}
                </p>
                <div className="eng-tags">
                  <span>
                    <Clock3 size={14} />
                    {displayDate(c.due_at)}
                  </span>
                  <span>{c.total} 位客人</span>
                  {c.status === "cancelled" && <span>已取消</span>}
                </div>
              </div>
              <div className="eng-campaign-status">
                <strong>
                  {(c.counts.delivered ?? 0) + (c.counts.read ?? 0)}
                </strong>
                <span>已送達／已讀</span>
              </div>
              <div className="eng-campaign-actions">
                <button
                  onClick={() => {
                    setSelected(c);
                    setResultAfter("");
                  }}
                >
                  查看結果
                  <ArrowRight size={15} />
                </button>
                {data.canManage &&
                  c.status === "scheduled" &&
                  (c.counts.scheduled ?? 0) > 0 && (
                    <button
                      className="eng-text"
                      disabled={busy || frozen}
                      onClick={() =>
                        void send({
                          action: "cancel",
                          commandId: crypto.randomUUID(),
                          id: c.id,
                        })
                      }
                    >
                      取消未發送
                    </button>
                  )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="eng-empty">
          <div>
            <MessageSquare size={30} />
          </div>
          <h2>下一次聯絡，由呢度開始</h2>
          <p>
            選擇客人、準備內容，再安排發送時間。
            <br />
            每位客人嘅結果都會留低。
          </p>
          {data.canManage && (
            <button className="eng-primary" onClick={create}>
              新增第一則推播
              <ArrowRight size={17} />
            </button>
          )}
        </section>
      )}
      <div className="eng-pagination">
        {cursor && <button onClick={() => setCursor("")}>返回最新</button>}
        {data.nextCampaign && (
          <button onClick={() => setCursor(data.nextCampaign!)}>
            較早推播
          </button>
        )}
      </div>
      <details className="eng-details">
        <summary>
          <ShieldCheck size={18} />
          渠道與發送設定<span>準備好先開始</span>
        </summary>
        <div className="eng-readiness">
          {data.connections.length ? (
            data.connections.map((c) => (
              <div key={c.id}>
                <strong>{c.label}</strong>
                <span>{c.channel}</span>
                <span>{c.ready ? "已連接" : "待接通"}</span>
                <span>{c.inbound ? "✓ 已收到真實訊息" : "待驗收收件"}</span>
                <span>{c.accepted ? "✓ 平台已接納過發送" : "待驗收發件"}</span>
                <span>{c.delivered ? "✓ 已有送達回報" : "待送達回報"}</span>
              </div>
            ))
          ) : (
            <p>
              尚未接駁通訊渠道。
              <Link href={`/company/${companyId}/settings`}>前往連接設定</Link>
            </p>
          )}
        </div>
        <PolicyForm data={data} busy={busy || frozen} onSave={send} />
      </details>
      <dialog
        ref={dialog}
        aria-labelledby="eng-new-campaign"
        className="eng-dialog"
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      >
        <div className="eng-dialog-head">
          <div>
            <span className="eng-eyebrow">NEW CAMPAIGN</span>
            <h2 id="eng-new-campaign">安排一則客戶訊息</h2>
          </div>
          <button
            aria-label="關閉新增推播"
            disabled={busy}
            onClick={() => {
              dialog.current?.close();
              setOpen(false);
            }}
          >
            <X size={20} />
          </button>
        </div>
        {open && (
          <CampaignBuilder
            data={data}
            companyId={companyId}
            initialBrand={brand}
            frozen={frozen}
            busy={busy}
            error={error}
            onSubmit={send}
            onRetry={() => pending.current && void send(pending.current)}
          />
        )}
      </dialog>
      <dialog
        ref={resultsDialog}
        aria-labelledby="eng-campaign-results"
        className="eng-dialog eng-results"
        onClose={() => setSelected(null)}
      >
        <div className="eng-dialog-head">
          <div>
            <span className="eng-eyebrow">DELIVERY RESULTS</span>
            <h2 id="eng-campaign-results">{selected?.name}</h2>
          </div>
          <button
            aria-label="關閉發送結果"
            onClick={() => {
              resultsDialog.current?.close();
              setSelected(null);
            }}
          >
            <X size={20} />
          </button>
        </div>
        <p>平台接納代表開始處理；送達及已讀會按渠道回報更新。</p>
        {results.error && <p role="alert">{results.error.message}</p>}
        {results.data ? (
          <>
            <div className="eng-results-summary">
              {Object.entries(results.data.resultCounts).map(([state, n]) => (
                <span key={state}>
                  {stateNames[state as keyof typeof stateNames]}{" "}
                  <strong>{n}</strong>
                </span>
              ))}
            </div>
            <p>共 {results.data.resultTotal} 位客人</p>
            <div className="eng-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>客人</th>
                    <th>狀態</th>
                    <th>說明</th>
                  </tr>
                </thead>
                <tbody>
                  {results.data.results.map((r) => (
                    <tr key={r.id}>
                      <td>{r.customer_name}</td>
                      <td>
                        <span className={`eng-state eng-state-${r.state}`}>
                          {stateNames[r.state]}
                        </span>
                      </td>
                      <td>
                        {r.reason
                          ? (reasonNames[r.reason] ?? "需核對渠道紀錄")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="eng-pagination">
              {resultAfter && (
                <button onClick={() => setResultAfter("")}>第一頁</button>
              )}
              {results.data.nextResult && (
                <button
                  onClick={() => setResultAfter(results.data!.nextResult!)}
                >
                  下一頁
                </button>
              )}
            </div>
          </>
        ) : (
          <p role="status">讀取結果中…</p>
        )}
      </dialog>
    </main>
  );
}
function CampaignBuilder({
  data,
  companyId,
  initialBrand,
  frozen,
  busy,
  error,
  onSubmit,
  onRetry,
}: {
  data: EngagementPage;
  companyId: string;
  initialBrand: string;
  frozen: boolean;
  busy: boolean;
  error: string;
  onSubmit: (c: Command) => Promise<void>;
  onRetry: () => void;
}) {
  const [step, setStep] = useState(1),
    [brand, setBrand] = useState(initialBrand || data.brands[0]?.id || ""),
    [connection, setConnection] = useState(""),
    [purpose, setPurpose] = useState<"marketing" | "service">("marketing"),
    [tag, setTag] = useState(""),
    [body, setBody] = useState(""),
    [templateId, setTemplateId] = useState(""),
    [templates, setTemplates] = useState(data.templates),
    [syncing, setSyncing] = useState(false),
    [localError, setLocalError] = useState(""),
    [values, setValues] = useState<Record<string, string>>({}),
    [name, setName] = useState(""),
    [when, setWhen] = useState("now"),
    [date, setDate] = useState("");
  const selected = data.connections.find(
      (c) => c.id === connection && c.brand_id === brand,
    ),
    inventory = templates.find((t) => t.connection_id === connection),
    template = inventory?.templates.find((t) => t.id === templateId),
    available =
      inventory?.templates.filter(
        (t) =>
          t.status === "APPROVED" &&
          t.supported &&
          t.category === (purpose === "marketing" ? "MARKETING" : "UTILITY"),
      ) ?? [];
  const previewKey = selected
    ? `/api/companies/${companyId}/engagement?` +
      new URLSearchParams({
        brand,
        connection,
        provider: selected.provider,
        purpose,
        tag,
      })
    : null;
  const audience = useSWR<EngagementPage>(previewKey, engagementFetcher, {
    keepPreviousData: false,
  });
  const definition: MessageDefinition =
    selected?.provider === "whatsapp" && template
      ? {
          kind: "template",
          body: template.body,
          name: template.name,
          locale: template.language,
          fingerprint: template.fingerprint,
          values: template.slots.map((s) => ({
            ...s,
            value: values[s.component + ":" + s.key] ?? "",
          })),
        }
      : { kind: "text", body, values: [] };
  const preview =
    template && selected?.provider === "whatsapp"
      ? template.components
          .map((raw) => {
            const c = raw as { type: string; text?: string };
            return (c.text ?? "").replace(
              /{{([^{}]+)}}/g,
              (_, k) => values[c.type.toLowerCase() + ":" + k] || "…",
            );
          })
          .filter(Boolean)
          .join("\n")
      : body;
  const validMessage =
    definition.kind === "template"
      ? !!template &&
        available.includes(template) &&
        definition.values.every((v) => v.value.trim())
      : !!body.trim();
  async function sync() {
    if (!selected) return;
    setSyncing(true);
    setLocalError("");
    try {
      const r = await fetch(`/api/companies/${companyId}/engagement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "templates",
            connectionId: connection,
          }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setTemplates((old) => [
        ...old.filter((t) => t.connection_id !== connection),
        {
          connection_id: connection,
          templates: d.templates,
          checked_at: new Date().toISOString(),
        },
      ]);
      setTemplateId("");
      setValues({});
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "未能同步模板。");
    } finally {
      setSyncing(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (step !== 3) return;
    if (frozen) {
      onRetry();
      return;
    }
    if (!selected || !validMessage || !audience.data?.audience?.total) return;
    let dueAt = new Date().toISOString();
    if (when === "later") {
      const parsed = new Date(date + ":00+08:00");
      if (
        !Number.isFinite(parsed.getTime()) ||
        parsed.getTime() < Date.parse(dueAt)
      ) {
        setLocalError("請選擇未來嘅香港時間。");
        return;
      }
      dueAt = parsed.toISOString();
    }
    void onSubmit({
      action: "campaign",
      commandId: crypto.randomUUID(),
      id: crypto.randomUUID(),
      brandId: brand,
      provider: selected.provider,
      connectionId: connection,
      name,
      purpose,
      definition,
      audience: { tag },
      dueAt,
    });
  }
  return (
    <form onSubmit={submit}>
      <ol className="eng-steps">
        {["揀客人", "寫訊息", "定時間"].map((label, i) => (
          <li
            key={label}
            className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}
          >
            <span>{step > i + 1 ? <Check size={14} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <fieldset disabled={frozen || busy} className="eng-form-fields">
        {step === 1 && (
          <div className="eng-form-section">
            <h3>今次聯絡邊啲客人？</h3>
            <div className="eng-two">
              <label>
                品牌
                <select
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value);
                    setConnection("");
                    setTemplateId("");
                  }}
                >
                  {data.brands.map((b) => (
                    <option value={b.id} key={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                發送渠道
                <select
                  required
                  value={connection}
                  onChange={(e) => {
                    setConnection(e.target.value);
                    setTemplateId("");
                    setValues({});
                  }}
                >
                  <option value="">選擇渠道</option>
                  {data.connections
                    .filter((c) => c.brand_id === brand)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} · {c.channel}
                        {!c.ready ? "（待接通）" : ""}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              訊息用途
              <select
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value as typeof purpose);
                  setTemplateId("");
                }}
              >
                <option value="marketing">營銷訊息</option>
                <option value="service">服務通知</option>
              </select>
            </label>
            <label>
              客戶標籤 <span>留空即揀全部有呢個渠道嘅客人</span>
              <input
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                maxLength={40}
                placeholder="例如：有興趣"
              />
            </label>
            <div className="eng-audience" aria-live="polite">
              {audience.error ? (
                <p role="alert">{audience.error.message}</p>
              ) : audience.data?.audience ? (
                <>
                  <strong>
                    {audience.data.audience.total}
                    <small>位客人符合篩選</small>
                  </strong>
                  <p>
                    {audience.data.audience.consented} 位已記錄同意收取
                    {purpose === "marketing" ? "營銷訊息" : "服務通知"}
                    。發送前會再核對。
                  </p>
                  <div className="eng-tags">
                    {audience.data.audience.sample.map((c) => (
                      <span key={c.customer_id}>{c.customer_name}</span>
                    ))}
                  </div>
                </>
              ) : (
                <p>
                  {selected
                    ? "正在計算客人數量…"
                    : "選擇渠道後，就可以睇到客人數量。"}
                </p>
              )}
            </div>
            {selected && !selected.ready && (
              <p className="eng-hint">
                呢個渠道未完成接通。可以準備內容；未就緒前系統唔會發送。
              </p>
            )}
          </div>
        )}
        {step === 2 && (
          <div className="eng-form-section">
            <h3>準備今次想講嘅內容</h3>
            <label>
              推播名稱
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：十一月會員活動"
              />
            </label>
            {selected?.provider === "whatsapp" ? (
              <>
                <div className="eng-template-head">
                  <label>
                    WhatsApp 官方模板
                    <select
                      value={templateId}
                      onChange={(e) => {
                        setTemplateId(e.target.value);
                        setValues({});
                      }}
                    >
                      <option value="">選擇已獲批准嘅模板</option>
                      {available.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} · {t.language}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => void sync()}
                  >
                    <RefreshCw size={15} />
                    {syncing ? "同步中…" : "同步模板"}
                  </button>
                </div>
                <p className="eng-hint">
                  {inventory
                    ? `上次同步 ${displayDate(inventory.checked_at)}`
                    : "從 Meta 同步正式模板後即可選擇。"}{" "}
                  目前支援文字模板；含媒體或互動按鈕嘅模板會保留於 Meta 管理。
                </p>
                {template?.slots.map((s) => (
                  <label key={s.component + ":" + s.key}>
                    {s.component === "header" ? "標題" : "內容"}欄位 {s.key}
                    <input
                      required
                      maxLength={1024}
                      value={values[s.component + ":" + s.key] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          [s.component + ":" + s.key]: e.target.value,
                        }))
                      }
                      placeholder="可用 {{name}} 放入客戶姓名"
                    />
                  </label>
                ))}
              </>
            ) : (
              <label>
                訊息內容
                <textarea
                  required
                  rows={6}
                  maxLength={1000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="你好 {{name}}，…"
                />
                <span>只可喺客人最後一次訊息後 24 小時內發送。</span>
              </label>
            )}
            <div className="eng-message-preview">
              <span>客人會見到</span>
              <p>{preview || "填寫內容後，預覽會出現喺呢度。"}</p>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="eng-form-section">
            <h3>幾時聯絡客人？</h3>
            <div className="eng-radio">
              <label>
                <input
                  type="radio"
                  name="timing"
                  checked={when === "now"}
                  onChange={() => setWhen("now")}
                />
                現在開始
              </label>
              <label>
                <input
                  type="radio"
                  name="timing"
                  checked={when === "later"}
                  onChange={() => setWhen("later")}
                />
                揀個時間
              </label>
            </div>
            {when === "later" && (
              <label>
                發送時間（香港）
                <input
                  type="datetime-local"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            )}
            <section className="eng-confirm">
              <h4>{name}</h4>
              <p>
                {selected?.label} · {audience.data?.audience?.total ?? 0} 位客人
              </p>
              <p>{audience.data?.audience?.consented ?? 0} 位已記錄收取同意</p>
              <p>
                安靜時段 {data.policy.quiet_start}:00–{data.policy.quiet_end}
                :00；每位客人每 {data.policy.frequency_hours}{" "}
                小時最多一則同類訊息。
              </p>
              {data.policy.automations_paused && (
                <p className="eng-alert">
                  公司已暫停自動客戶訊息；請由公司管理員恢復發送設定。
                </p>
              )}
              {purpose === "marketing" && !data.policy.marketing_enabled && (
                <p className="eng-alert">
                  公司尚未開啟營銷發送。請先於發送設定開啟，再安排推播。
                </p>
              )}
            </section>
          </div>
        )}
      </fieldset>
      {(error || localError) && (
        <p role="alert" className="eng-alert">
          {error || localError}
        </p>
      )}
      <footer className="eng-dialog-footer">
        {step > 1 && !frozen ? (
          <button type="button" onClick={() => setStep((s) => s - 1)}>
            上一步
          </button>
        ) : (
          <span />
        )}
        {frozen ? (
          <button
            key="campaign-retry"
            type="button"
            className="eng-primary"
            disabled={busy}
            onClick={onRetry}
          >
            {busy ? "核對中…" : "核對同一請求"}
          </button>
        ) : step < 3 ? (
          <button
            key="campaign-next"
            type="button"
            className="eng-primary"
            disabled={
              step === 1
                ? !selected || !audience.data?.audience?.total
                : !validMessage || !name.trim()
            }
            onClick={(event) => {
              event.preventDefault();
              setLocalError("");
              setStep((s) => s + 1);
            }}
          >
            下一步
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            key="campaign-submit"
            type="submit"
            className="eng-primary"
            disabled={
              busy ||
              data.policy.automations_paused ||
              (purpose === "marketing" && !data.policy.marketing_enabled)
            }
          >
            <Send size={16} />
            安排發送
          </button>
        )}
      </footer>
    </form>
  );
}
function PolicyForm({
  data,
  busy,
  onSave,
}: {
  data: EngagementPage;
  busy: boolean;
  onSave: (c: Command) => Promise<void>;
}) {
  const p = data.policy;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void onSave({
      action: "policy",
      commandId: crypto.randomUUID(),
      revision: p.revision,
      marketingEnabled: f.get("marketing") === "on",
      executionPaused: f.has("paused"),
      quietStart: Number(f.get("quietStart")),
      quietEnd: Number(f.get("quietEnd")),
      frequencyHours: Number(f.get("frequency")),
      dailyLimit: Number(f.get("daily")),
      minuteLimit: Number(f.get("minute")),
    });
  }
  return (
    <form className="eng-policy" key={p.revision} onSubmit={submit}>
      <h3>發送節奏</h3>
      <fieldset disabled={busy || !data.canManageCompany}>
        <label className="eng-check">
          <input
            type="checkbox"
            name="paused"
            defaultChecked={p.automations_paused ?? false}
          />
          暫停所有自動客戶訊息
        </label>
        <p className="eng-hint">
          暫停會取消尚未提交嘅推播及旅程步驟。重新開啟後，已取消步驟會保留紀錄。
        </p>
        <label className="eng-check">
          <input
            type="checkbox"
            name="marketing"
            defaultChecked={p.marketing_enabled}
          />
          開啟已取得同意嘅營銷訊息
        </label>
        <div className="eng-two">
          <label>
            安靜時段開始（香港）
            <input
              type="number"
              name="quietStart"
              min={0}
              max={23}
              defaultValue={p.quiet_start}
              required
            />
          </label>
          <label>
            安靜時段結束（香港）
            <input
              type="number"
              name="quietEnd"
              min={0}
              max={23}
              defaultValue={p.quiet_end}
              required
            />
          </label>
          <label>
            同一客人聯絡間隔（小時）
            <input
              type="number"
              name="frequency"
              min={1}
              max={720}
              defaultValue={p.frequency_hours}
              required
            />
          </label>
          <label>
            每日排程訊息上限
            <input
              type="number"
              name="daily"
              min={1}
              max={10000}
              defaultValue={p.daily_limit}
              required
            />
          </label>
          <label>
            每分鐘發送上限
            <input
              type="number"
              name="minute"
              min={1}
              max={100}
              defaultValue={p.minute_limit}
              required
            />
          </label>
        </div>
        {data.canManageCompany && <button type="submit">儲存發送設定</button>}
      </fieldset>
    </form>
  );
}
