"use client";
import { useRef, useState } from "react";
import useSWR from "swr";
import {
  Clock3,
  History,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  flowTriggers,
  flowActionSchema,
  validateLiveFlow,
  type FlowAction,
  type FlowRun,
  type FlowRuntimePage,
} from "@/lib/flow-runtime/model";
import type { MessageDefinition } from "@/lib/engagement/model";
import MessageFields from "@/components/engagement/MessageFields";
import type { Flow } from "./model";
import "./flow-runtime.css";
import "../../engagement/engagement.css";

const statusNames: Record<FlowRun["state"], string> = {
  active: "處理中",
  waiting: "等候時間",
  review: "待核實預約",
  form: "待補意向",
  delivery: "派送核對中",
  completed: "已完成",
  stopped: "已停止",
  handoff: "已交畀同事",
};
const reasonNames: Record<string, string> = {
  flow_changed: "流程已更新或暫停",
  flow_republished: "新版本已發布",
  flow_paused: "流程已暫停",
  customer_replied: "客人已有新回覆",
  human_replied: "同事已回覆",
  human_takeover: "真人接手",
  customer_changed: "客戶身份連結已更新",
  authority_changed: "公司或同事權限已更新",
  source_changed: "來源資料已更新",
  booking_changed: "核實預約已更新",
  knowledge_changed: "品牌資料已更新",
  knowledge_missing: "未找到適用嘅有效品牌資料",
  confirmed_booking_required: "需要核實預約",
  source_details_missing: "缺少可核實欄位",
  consent_missing: "未有適用嘅聯絡同意",
  window_closed: "已超出客服回覆窗口",
  connection_not_ready: "渠道未準備好",
  delivery_unknown: "平台結果待核對，未有重發",
  worker_interrupted: "平台結果待核對，未有重發",
  frequency_limit: "已達聯絡頻率限制",
  staff_cancelled: "同事已停止",
  execution_paused: "公司自動化已暫停",
  awaiting_confirmed_booking: "等候同事連結已核實預約",
  awaiting_intake: "等候客戶意向資料",
  reminder_due: "等候香港時間提醒時段",
  appointment_expired: "預約時間已過",
  template_changed: "正式模板需要重新核對",
};
type Settings = {
  trigger: keyof typeof flowTriggers;
  connectionId: string;
  purpose: "service" | "marketing";
  deliveries: Record<string, MessageDefinition>;
};
class FlowReadError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function readFlow(url: string): Promise<FlowRuntimePage> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok)
    throw new FlowReadError(body.error ?? "未能讀取流程。", response.status);
  return body;
}
function RunCard({
  run,
  enabled,
  send,
  companyId,
}: {
  run: FlowRun;
  enabled: boolean;
  send: (a: FlowAction) => Promise<void>;
  companyId: string;
}) {
  const [booking, setBooking] = useState("");
  const [service, setService] = useState(""),
    [desiredAt, setDesiredAt] = useState(""),
    [note, setNote] = useState("");
  const intakeDate = new Date(
    (desiredAt.length === 16 ? desiredAt + ":00" : desiredAt) + "+08:00",
  );
  const intakeAt = Number.isFinite(intakeDate.getTime())
    ? intakeDate.toISOString()
    : null;
  const date = (s: string) =>
    new Intl.DateTimeFormat("zh-HK", {
      timeZone: "Asia/Hong_Kong",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(s));
  const command = () => ({
    commandId: crypto.randomUUID(),
    flowId: run.flow_id,
  });
  return (
    <article className="fr-run">
      <header>
        <div>
          <strong>{run.customer_name}</strong>
          <small>
            版本 {run.version} · {date(run.created_at)}
          </small>
        </div>
        <span className={`fr-state fr-state-${run.state}`}>
          {statusNames[run.state]}
        </span>
      </header>
      <p>
        {run.node_title}
        {run.reason
          ? ` · ${reasonNames[run.reason] ?? "請核對來源或渠道狀態"}`
          : ""}
      </p>
      {run.state === "waiting" && (
        <small>
          <Clock3 size={12} /> {date(run.due_at)}（香港時間）
        </small>
      )}
      {run.state === "review" && (
        <div className="fr-review">
          <label>
            連結已核實預約
            <select
              aria-label={`連結已核實預約 ${run.id}`}
              value={booking}
              disabled={!enabled}
              onChange={(e) => setBooking(e.target.value)}
            >
              <option value="">選擇已確認紀錄</option>
              {run.bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.service} · {date(b.desiredAt)}
                </option>
              ))}
            </select>
          </label>
          {!run.bookings.length && (
            <p>此對話未有符合嘅核實預約。請先喺客戶紀錄完成核實。</p>
          )}
          <button
            className="st-button"
            disabled={!enabled || !booking}
            onClick={() =>
              void send({
                ...command(),
                action: "continue",
                runId: run.id,
                nodeId: run.node_id,
                bookingId: booking,
              })
            }
          >
            核對後繼續
          </button>
        </div>
      )}
      {run.state === "form" && (
        <div className="fr-review">
          <p>填入客人提供嘅意向，下一步仍須核實預約。</p>
          <label>
            服務
            <input
              aria-label={`服務 ${run.id}`}
              value={service}
              maxLength={100}
              disabled={!enabled}
              onChange={(e) => setService(e.target.value)}
            />
          </label>
          <label>
            心儀時間（香港時間）
            <input
              aria-label={`心儀時間（香港時間） ${run.id}`}
              type="datetime-local"
              value={desiredAt}
              disabled={!enabled}
              onChange={(e) => setDesiredAt(e.target.value)}
            />
          </label>
          <label>
            來源及補充
            <textarea
              aria-label={`來源及補充 ${run.id}`}
              value={note}
              maxLength={1000}
              disabled={!enabled}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            className="st-button"
            disabled={!enabled || !service.trim() || !intakeAt}
            onClick={() =>
              void send({
                ...command(),
                action: "continue",
                runId: run.id,
                nodeId: run.node_id,
                fields: {
                  service,
                  desiredAt: intakeAt!,
                  note,
                },
              })
            }
          >
            記錄意向並繼續
          </button>
        </div>
      )}
      <details>
        <summary>查看執行紀錄</summary>
        <ol className="fr-steps">
          {run.steps.map((s) => (
            <li key={s.node_id + ":" + s.state}>
              <span>{s.node_id}</span>
              <strong>
                {s.state === "completed"
                  ? "完成"
                  : s.state === "queued"
                    ? "已加入派送核對"
                    : s.state === "stopped"
                      ? "已停止"
                      : "等候處理"}
              </strong>
              <time>{date(s.created_at)}</time>
            </li>
          ))}
        </ol>
      </details>
      <footer>
        <a
          href={`/company/${companyId}/crm${run.provider === "whatsapp" ? "/whatsapp" : "/meta"}?thread=${encodeURIComponent(run.thread_id)}`}
        >
          開啟來源對話
        </a>
        {!["completed", "stopped", "handoff"].includes(run.state) && (
          <button
            disabled={!enabled}
            onClick={() =>
              void send({ ...command(), action: "cancel", runId: run.id })
            }
          >
            停止呢次流程
          </button>
        )}
      </footer>
    </article>
  );
}
export default function FlowExecutionPanel({
  companyId,
  flow,
}: {
  companyId: string;
  flow: Flow;
}) {
  const [draft, setDraft] = useState<Settings | null>(null),
    [cursor, setCursor] = useState(""),
    [tab, setTab] = useState<"settings" | "history">("settings");
  const [busy, setBusy] = useState(false),
    [frozen, setFrozen] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [threadId, setThreadId] = useState("");
  const pending = useRef<FlowAction | null>(null),
    endpoint = `/api/companies/${companyId}/flows`;
  const {
    data: cached,
    error: readError,
    mutate,
    isValidating,
  } = useSWR<FlowRuntimePage, FlowReadError>(
    `${endpoint}?flow=${encodeURIComponent(flow.id)}${cursor ? "&" + cursor : ""}`,
    readFlow,
    { refreshInterval: 15000, keepPreviousData: false },
  );
  const denied = readError?.status === 401 || readError?.status === 403;
  const data = denied ? undefined : cached;
  const p = data?.publication;
  const settings: Settings = draft ?? {
    trigger: p?.trigger_kind ?? "manual",
    connectionId: p?.connection_id ?? "",
    purpose: p?.purpose ?? "service",
    deliveries: p?.deliveries ?? {},
  };
  const available =
      data?.connections.filter((c) => c.brand_id === flow.brandId) ?? [],
    connection = available.find((c) => c.id === settings.connectionId);
  const enabled = !!data?.canManage && !busy && !frozen && !readError;
  const writeEnabled = !!data?.canEdit && !busy && !frozen && !readError;
  function patch(value: Partial<Settings>) {
    setDraft({ ...settings, ...value });
  }
  async function send(action: FlowAction) {
    if (busy || (frozen && pending.current !== action)) return;
    const parsed = flowActionSchema.safeParse(action);
    if (!parsed.success) {
      setError("請核對必填資料及時間格式。");
      return;
    }
    const valid = parsed.data;
    pending.current = valid;
    setFrozen(true);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status < 500) {
          pending.current = null;
          setFrozen(false);
        }
        throw Error(result.error ?? "未能完成，請核對同一請求。");
      }
      pending.current = null;
      setFrozen(false);
      setDraft(null);
      setNotice(
        valid.action === "publish" ? "正式版本已發布。" : "流程紀錄已更新。",
      );
      if (valid.action === "enroll") setTab("history");
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能完成，請核對同一請求。");
    } finally {
      setBusy(false);
    }
  }
  const issues = connection
    ? validateLiveFlow(flow, connection.provider, settings.deliveries)
    : [];
  const draftChanged = !!p && JSON.stringify(p.graph) !== JSON.stringify(flow);
  return (
    <details className="fr-panel">
      <summary>
        <span>
          <ShieldCheck size={15} />
          正式執行
        </span>
        <span className="fr-summary-state">
          {!data
            ? readError
              ? "未能讀取"
              : "讀取中…"
            : !p
              ? "尚未發布"
              : p.enabled
                ? `已啟用 v${p.published_version}`
                : "已暫停"}
        </span>
      </summary>
      <div className="fr-panel-body">
        <nav aria-label="流程正式執行">
          <button
            className={tab === "settings" ? "is-active" : ""}
            aria-pressed={tab === "settings"}
            onClick={() => setTab("settings")}
          >
            <Play size={14} />
            發布設定
          </button>
          <button
            className={tab === "history" ? "is-active" : ""}
            aria-pressed={tab === "history"}
            onClick={() => setTab("history")}
          >
            <History size={14} />
            執行紀錄
          </button>
          <button
            aria-label="重新讀取正式流程"
            disabled={isValidating}
            onClick={() => void mutate()}
          >
            <RefreshCw size={14} />
          </button>
        </nav>
        {(error || readError) && (
          <p role="alert" className="fr-error">
            {error || readError?.message}
          </p>
        )}
        {notice && (
          <p role="status" className="fr-notice">
            {notice}
          </p>
        )}
        {frozen && !busy && (
          <button
            className="st-button"
            onClick={() => {
              const a = pending.current;
              if (a) void send(a);
            }}
          >
            核對同一請求
          </button>
        )}
        {data && tab === "settings" && (
          <>
            {draftChanged && (
              <p className="fr-notice">
                畫布有新改動；現有流程繼續使用已發布版本。
              </p>
            )}
            {!available.length && (
              <p>此品牌未有已接駁渠道。可以繼續設計畫布，接駁後再發布。</p>
            )}
            <div className="fr-setting-grid">
              <label>
                開始方式
                <select
                  aria-label="正式流程開始方式"
                  disabled={!enabled}
                  value={settings.trigger}
                  onChange={(e) =>
                    patch({ trigger: e.target.value as Settings["trigger"] })
                  }
                >
                  {Object.entries(flowTriggers)
                    .filter(([k]) => k !== "completed" || data.hasPos)
                    .map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                渠道
                <select
                  aria-label="正式流程渠道"
                  disabled={!enabled}
                  value={settings.connectionId}
                  onChange={(e) =>
                    patch({ connectionId: e.target.value, deliveries: {} })
                  }
                >
                  <option value="">選擇此品牌渠道</option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} · {c.channel}
                      {!c.ready ? "（未就緒）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                聯絡用途
                <select
                  aria-label="正式流程聯絡用途"
                  disabled={!enabled}
                  value={settings.purpose}
                  onChange={(e) =>
                    patch({
                      purpose: e.target.value as Settings["purpose"],
                      deliveries: {},
                    })
                  }
                >
                  <option value="service">服務跟進</option>
                  <option value="marketing">推廣聯絡</option>
                </select>
              </label>
            </div>
            {connection &&
              flow.nodes
                .filter((n) => ["message", "reminder"].includes(n.kind))
                .map((n) => (
                  <details className="fr-message" key={n.id}>
                    <summary>{n.title} · 發送設定</summary>
                    <label>
                      <input
                        type="checkbox"
                        disabled={!enabled}
                        checked={!!settings.deliveries[n.id]}
                        onChange={(e) => {
                          const deliveries = { ...settings.deliveries };
                          if (e.target.checked)
                            deliveries[n.id] = {
                              kind: "text",
                              body:
                                n.kind === "reminder"
                                  ? n.config.template
                                  : n.config.message,
                              values: [],
                            };
                          else delete deliveries[n.id];
                          patch({ deliveries });
                        }}
                      />
                      自訂文字或正式 WhatsApp 模板
                    </label>
                    {settings.deliveries[n.id] && (
                      <fieldset disabled={!enabled}>
                        <MessageFields
                          companyId={companyId}
                          connection={connection}
                          purpose={settings.purpose}
                          initialTemplates={data.templates}
                          value={settings.deliveries[n.id]}
                          canSync={enabled}
                          onChange={(v) => {
                            if (enabled)
                              patch({
                                deliveries: {
                                  ...settings.deliveries,
                                  [n.id]: v,
                                },
                              });
                          }}
                        />
                      </fieldset>
                    )}
                  </details>
                ))}
            <p className="fr-boundary">
              每次派送重驗同意、渠道及客服窗口。預約提醒只會使用已核實紀錄；發布只影響之後開始嘅流程。
            </p>
            {!!issues.length && <p className="fr-error">{issues[0]}</p>}
            <div className="fr-actions">
              <button
                className="st-button st-primary"
                disabled={!enabled || !connection || issues.length > 0}
                onClick={() => {
                  if (connection)
                    void send({
                      commandId: crypto.randomUUID(),
                      action: "publish",
                      flow,
                      revision: p?.revision ?? 0,
                      trigger: settings.trigger,
                      provider: connection.provider,
                      connectionId: connection.id,
                      purpose: settings.purpose,
                      deliveries: settings.deliveries,
                      enabled: true,
                    });
                }}
              >
                <Play size={14} />
                {p ? "發布新版本" : "發布並啟用"}
              </button>
              {p && (
                <button
                  className="st-button"
                  disabled={!enabled}
                  onClick={() =>
                    void send({
                      commandId: crypto.randomUUID(),
                      action: "toggle",
                      flowId: flow.id,
                      revision: p.revision,
                      enabled: !p.enabled,
                    })
                  }
                >
                  {p.enabled ? <Pause size={14} /> : <Play size={14} />}
                  {p.enabled ? "暫停流程" : "重新啟用"}
                </button>
              )}
            </div>
            {p?.enabled && (
              <div className="fr-manual">
                <label>
                  由同事開始一次
                  <select
                    aria-label="由同事開始一次"
                    disabled={!writeEnabled}
                    value={threadId}
                    onChange={(e) => setThreadId(e.target.value)}
                  >
                    <option value="">選擇客戶對話</option>
                    {data.threads
                      .filter(
                        (t) =>
                          t.provider === p.provider &&
                          t.connection_id === p.connection_id,
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} · {t.channel}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  className="st-button"
                  disabled={!writeEnabled || !threadId}
                  onClick={() =>
                    void send({
                      commandId: crypto.randomUUID(),
                      action: "enroll",
                      flowId: flow.id,
                      threadId,
                    })
                  }
                >
                  開始流程
                </button>
              </div>
            )}
          </>
        )}
        {data && tab === "history" && (
          <>
            <p className="fr-boundary">
              保留每次流程實際使用嘅版本、節點及派送狀態。
            </p>
            {!data.runs.length ? (
              <p className="fr-empty">未有流程執行紀錄。</p>
            ) : (
              data.runs.map((run) => (
                <RunCard
                  key={run.id}
                  run={run}
                  companyId={companyId}
                  enabled={writeEnabled}
                  send={send}
                />
              ))
            )}
            <div className="fr-actions">
              {!!cursor && (
                <button className="st-button" onClick={() => setCursor("")}>
                  返回最新
                </button>
              )}
              {data.nextCursor && (
                <button
                  className="st-button"
                  onClick={() => setCursor(data.nextCursor!)}
                >
                  較早紀錄
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
