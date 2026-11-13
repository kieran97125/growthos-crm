"use client";
import { useState, useRef, useEffect } from "react";
import { Streamdown } from "streamdown";
import type { ComponentProps } from "react";
import Link from "next/link";
import {
  ArrowUp,
  ArrowUpRight,
  Plus,
  MessageSquare,
  Layers,
  Sparkles,
  Target,
  UsersRound,
  Check,
  Clock3,
  ThumbsDown,
  RefreshCw,
  BookOpen,
  ChevronRight,
  X,
  ClipboardCopy,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import type { CopilotAnswer, Observation, Task } from "@/lib/copilot/model";
import { useCopilot } from "./CopilotProvider";
const time = (v: string) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(v));
const markdownComponents = {
  strong: ({ children }: ComponentProps<"strong">) => (
    <strong>{children}</strong>
  ),
  em: ({ children }: ComponentProps<"em">) => <em>{children}</em>,
  a: ({ href, children }: ComponentProps<"a">) =>
    href && /^https:\/\//.test(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: () => null,
};
const examples = {
  activity: [
    [
      "停滯查詢再互動",
      "按現有客戶資料，幫我揀一個值得重新跟進嘅客群，準備活動草稿、文案及量度方法。",
    ],
    [
      "服務推廣計劃",
      "先了解我公司已核准服務同定位，再同我一齊制定一個營銷活動；欠資料就先問我。",
    ],
    [
      "現客再次預約",
      "幫我研究點樣令現客再次預約，說明而家有咩數據、欠咩記錄，同埋可以先做咩。",
    ],
  ],
  service: [
    [
      "客人猶豫，點樣覆？",
      "我唔知應該點覆目前客人。請按對話找出佢猶豫嘅原因，建議兩個自然回覆方向，引導佢踏出預約下一步。",
    ],
    [
      "標籤分類建議",
      "按目前客戶原話及現有標籤，建議應該點分類，解釋原因；唔好猜測敏感身份。",
    ],
    [
      "整理跟進優先次序",
      "睇公司而家嘅查詢同預約情況，幫我列出今日值得先處理嘅工作同原因。",
    ],
  ],
  analysis: [
    [
      "邊類客較容易預約？",
      "分析現有客群確認預約比例。列清期間、樣本、分子分母、數據限制；資料唔夠就直講，唔好斷言因果。",
    ],
    [
      "搵營運機會",
      "由已授權資料找出一個最值得改善嘅營運機會，講觀察、原因、建議及點驗證。",
    ],
    [
      "帶我用 Convelta",
      "因應目前頁面，教我點用 Convelta 串連客服、客戶、AI同預約；清楚講已可用同未接駁嘅部分。",
    ],
  ],
} as const;
function readable(answer: CopilotAnswer) {
  return answer.answer.replace(/\[([^\]]+)\]/g, (match, id: string) => {
    const i = answer.facts.findIndex((f) => f.id === id);
    return i >= 0 ? `〔${i + 1}〕` : match;
  });
}
function Signal({
  signal: o,
  onUse,
}: {
  signal: Observation;
  onUse?: () => void;
}) {
  const c = useCopilot(),
    [confirm, setConfirm] = useState(false);
  if (!c) return null;
  return (
    <article className="cc-observation">
      <div>
        <span>
          {o.kind === "conversion"
            ? "客群觀察"
            : o.kind === "tag"
              ? "客戶分類"
              : o.kind === "campaign"
                ? "活動機會"
                : o.kind === "setup"
                  ? "資料準備"
                  : "跟進建議"}
        </span>
        <Sparkles size={14} />
      </div>
      <h3>{o.title}</h3>
      <p>{o.detail}</p>
      <details>
        <summary>點解會咁建議</summary>
        <ul>
          {o.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </details>
      <footer>
        <button
          className="cc-inline"
          disabled={c.busy}
          onClick={() => {
            c.useObservation(o);
            onUse?.();
          }}
        >
          同 C 一齊做
          <ArrowUpRight size={14} />
        </button>
        <button
          title="明日再提醒"
          aria-label={`明日再提醒：${o.title}`}
          disabled={c.busy}
          onClick={() =>
            void c.act({
              action: "feedback",
              key: o.key,
              family: o.family,
              subject: o.subject,
              status: "snoozed",
            })
          }
        >
          <Clock3 size={14} />
        </button>
        <button
          title="今次唔需要"
          aria-label={`略過：${o.title}`}
          disabled={c.busy}
          onClick={() =>
            void c.act({
              action: "feedback",
              key: o.key,
              family: o.family,
              subject: o.subject,
              status: "dismissed",
            })
          }
        >
          <ThumbsDown size={14} />
        </button>
      </footer>
      {o.action.kind === "tag" &&
        c.bundle?.ai.canGenerate &&
        (!confirm ? (
          <button
            className="cc-tag-apply"
            disabled={c.busy}
            onClick={() => setConfirm(true)}
          >
            檢視加「{o.action.tag}」<Check size={13} />
          </button>
        ) : (
          <div
            className="cc-tag-confirm"
            role="group"
            aria-label="確認客戶標籤"
          >
            <p>
              將「{o.action.tag}
              」加入目前客戶檔案；現有資料會保留。請先核對上面嘅客戶原話。
            </p>
            <div>
              <button
                className="cc-primary"
                disabled={c.busy}
                onClick={() =>
                  void c
                    .act({ action: "tag", key: o.key, confirmed: true })
                    .then((ok) => {
                      if (ok) setConfirm(false);
                    })
                }
              >
                確認加入標籤
              </button>
              <button
                className="cc-inline"
                disabled={c.busy}
                onClick={() => setConfirm(false)}
              >
                返回
              </button>
            </div>
          </div>
        ))}
      {o.action.kind === "open" && o.kind !== "setup" && (
        <Link
          className="cc-open-work"
          href={`/company/${c.companyId}/${o.action.path}`}
          onClick={() => c.setOpen(false)}
        >
          開啟相關工作
          <ChevronRight size={13} />
        </Link>
      )}
    </article>
  );
}
function Answer({ answer }: { answer: CopilotAnswer }) {
  const c = useCopilot(),
    [copied, setCopied] = useState(false);
  if (!c) return null;
  return (
    <>
      <Streamdown
        mode="static"
        controls={false}
        skipHtml
        className="cc-answer-text"
        components={markdownComponents}
      >
        {readable(answer)}
      </Streamdown>
      {answer.facts.length > 0 && (
        <details className="cc-evidence">
          <summary>
            <BookOpen size={14} />
            依據與資料範圍 · {answer.facts.length} 項
          </summary>
          {answer.facts.map((f, i) => (
            <div key={f.id}>
              <b>
                〔{i + 1}〕{f.label}
              </b>
              <p>{f.value}</p>
              <small>{f.source}</small>
            </div>
          ))}
        </details>
      )}
      {answer.campaign && (
        <section className="cc-campaign-plan">
          <span>活動草稿 · 待你審閱</span>
          <h3>{answer.campaign.title}</h3>
          <dl>
            <dt>目標</dt>
            <dd>{answer.campaign.objective}</dd>
            <dt>對象</dt>
            <dd>{answer.campaign.audience}</dd>
            <dt>訊息草稿</dt>
            <dd className="cc-copy">{answer.campaign.message}</dd>
          </dl>
          <ol>
            {answer.campaign.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <div className="cc-measures">
            {answer.campaign.measures.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
          <button
            className="cc-primary"
            disabled={c.busy || c.context.product !== "crm"}
            onClick={() =>
              void c.act({ action: "save-brief", requestId: answer.requestId })
            }
          >
            <Layers size={15} />
            保存活動草稿
          </button>
          <small>保存後可繼續跟進；未向客戶發送。</small>
        </section>
      )}
      <div className="cc-answer-actions">
        <button
          onClick={() =>
            void navigator.clipboard
              .writeText(readable(answer))
              .then(() => setCopied(true))
          }
        >
          <ClipboardCopy size={13} />
          {copied ? "已複製" : "複製"}
        </button>
        <span>{time(answer.createdAt)}</span>
      </div>
      {!!answer.nextQuestions.length && (
        <div className="cc-next-questions">
          {answer.nextQuestions.map((q) => (
            <button key={q} onClick={() => c.setComposer(q)} disabled={c.busy}>
              {q}
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
export default function CopilotSurface({
  compact = false,
}: {
  compact?: boolean;
}) {
  const c = useCopilot(),
    [category, setCategory] = useState<keyof typeof examples>("activity"),
    [tab, setTab] = useState<"threads" | "plans">("threads"),
    [selectedPlan, setSelectedPlan] = useState<Task | null>(null),
    [mobileList, setMobileList] = useState(false),
    [showObservations, setShowObservations] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const observationToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (compact) input.current?.focus();
  }, [compact]);
  if (!c) return <p className="cc-status">請先開啟公司工作空間。</p>;
  const b = c.bundle,
    base = `/company/${c.companyId}`,
    messages = b?.messages ?? [],
    name = b?.actorName ?? "你",
    canGenerate = !!b?.ai.enabled && !!b.ai.model && !!b.ai.canGenerate;
  const example = (message: string) => {
    c.setComposer(message);
    input.current?.focus();
  };
  const busyLocked = c.busy || !!c.pending || c.uncertain;
  return (
    <div className={`cc-surface ${compact ? "is-compact" : ""}`}>
      {!compact && (
        <nav className="cc-workroom-tabs" aria-label="AI 工作室功能">
          <Link href={`${base}/crm/ai`} aria-current="page">
            C 工作台
          </Link>
          <Link href={`${base}/crm/ai?mode=replies`}>回覆測試</Link>
          <Link href={`${base}/crm?view=bot`}>核准知識</Link>
        </nav>
      )}
      <div className="cc-workroom-body">
        <aside
          className={`cc-history ${mobileList ? "is-open" : ""}`}
          aria-label="C 任務記憶"
        >
          <div className="cc-history-heading">
            <b>
              <BrandMark size={24} />C 工作記憶
            </b>
            <button
              onClick={() => setMobileList(false)}
              className="cc-close-list"
            >
              收起
            </button>
          </div>
          <button
            className="cc-new-task"
            disabled={busyLocked}
            onClick={() => {
              c.newTask();
              setSelectedPlan(null);
              setMobileList(false);
            }}
          >
            <Plus size={16} />
            開始新任務
          </button>
          <div className="cc-list-tabs">
            <button
              aria-pressed={tab === "threads"}
              onClick={() => setTab("threads")}
            >
              <MessageSquare size={13} />
              最近任務
            </button>
            <button
              aria-pressed={tab === "plans"}
              onClick={() => setTab("plans")}
            >
              <Layers size={13} />
              活動草稿
            </button>
          </div>
          {tab === "threads" ? (
            b?.threads.length ? (
              b.threads.map((t) => (
                <button
                  className={`cc-task-row ${c.threadId === t.id ? "is-active" : ""}`}
                  key={t.id}
                  disabled={busyLocked}
                  onClick={() => {
                    c.selectThread(t.id);
                    setSelectedPlan(null);
                    setMobileList(false);
                  }}
                >
                  <MessageSquare size={15} />
                  <span>
                    <b>{t.title}</b>
                    <small>{time(t.updated_at)}</small>
                  </span>
                </button>
              ))
            ) : (
              <p className="cc-list-empty">
                由一個問題開始，C 會保留你嘅任務對話。
              </p>
            )
          ) : b?.tasks.length ? (
            b.tasks.map((t) => (
              <button
                className="cc-task-row"
                key={t.id}
                onClick={() => {
                  setSelectedPlan(t);
                  setMobileList(false);
                }}
              >
                <Layers size={15} />
                <span>
                  <b>{t.title}</b>
                  <small>
                    {
                      {
                        draft: "待審閱",
                        ready: "準備就緒",
                        complete: "整理完成",
                        cancelled: "已取消",
                      }[t.status]
                    }
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p className="cc-list-empty">
              同 C 建立活動後，保存嘅草稿會喺呢度。
            </p>
          )}
          <div className="cc-memory-note">
            <span>公司及個人範圍</span>
            <p>C 會記得你嘅選擇；只使用你有權讀取嘅公司紀錄。</p>
            <button
              disabled={c.busy}
              onClick={() =>
                void c.act({
                  action: "feedback",
                  key: "quiet",
                  family: "quiet",
                  subject: "all",
                  status: "snoozed",
                })
              }
            >
              <Clock3 size={13} />
              暫停主動提示 1 小時
            </button>
          </div>
        </aside>
        <section className="cc-main" aria-label="C 工作台">
          <div className="cc-top-line">
            <button
              className="cc-show-list"
              onClick={() => setMobileList(!mobileList)}
            >
              <Layers size={15} />
              工作記憶
            </button>
            <button
              ref={observationToggle}
              className="cc-show-observations"
              aria-label="開啟 C 工作觀察"
              aria-expanded={showObservations}
              onClick={() => setShowObservations(true)}
            >
              <Sparkles size={14} />
              工作觀察
            </button>
            <span>
              {b?.companyName ?? "公司工作空間"} ·{" "}
              {c.context.product.toUpperCase()}
              {c.context.customerId ? " · 正在處理客戶" : ""}
            </span>
            {!!b?.brands.length && (
              <select
                className="cc-brand-scope"
                aria-label="C 分析品牌"
                disabled={c.busy || !!c.context.customerId || !!c.pending}
                value={c.context.brandId ?? ""}
                onChange={(e) => c.setBrand(e.target.value)}
              >
                <option value="">所有品牌</option>
                {b.brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            )}
            <button
              aria-label="重新核對 C 工作資料"
              disabled={c.loading || c.busy}
              onClick={() => void c.refresh()}
            >
              <RefreshCw size={14} />
            </button>
          </div>
          {selectedPlan ? (
            <article className="cc-saved-plan">
              <button
                className="cc-inline"
                onClick={() => setSelectedPlan(null)}
              >
                返回對話
              </button>
              <span className="cc-eyebrow">SAVED CAMPAIGN BRIEF</span>
              <h1>{selectedPlan.title}</h1>
              <p>{selectedPlan.plan?.objective}</p>
              <h2>目標客群</h2>
              <p>{selectedPlan.plan?.audience}</p>
              <h2>訊息草稿</h2>
              <blockquote>{selectedPlan.plan?.message}</blockquote>
              <ol>
                {selectedPlan.plan?.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <div className="cc-measures">
                {selectedPlan.plan?.measures.map((m, i) => (
                  <span key={i}>{m}</span>
                ))}
              </div>
              <p className="cc-muted">
                呢份係活動準備記錄，唔代表已推播或已核准發送。
              </p>
              <button
                className="cc-primary"
                disabled={c.busy}
                onClick={() =>
                  void c
                    .act({
                      action: "brief-status",
                      id: selectedPlan.id,
                      revision: selectedPlan.revision,
                      status: "ready",
                    })
                    .then((saved) => {
                      if (saved) setSelectedPlan(null);
                    })
                }
              >
                標記準備就緒
                <Check size={15} />
              </button>
            </article>
          ) : (
            <>
              <div className="cc-chat" aria-live="polite" aria-busy={c.busy}>
                {!messages.length && !c.pending ? (
                  <div className="cc-welcome">
                    <div className="cc-hero-mark">
                      <BrandMark size={58} />
                      <i>
                        <Sparkles size={14} />
                      </i>
                    </div>
                    <p>你好，{name}。</p>
                    <h1>
                      下一步，<span>同 C 一齊諗。</span>
                    </h1>
                    <p className="cc-intro">
                      由客戶查詢、預約到營銷機會。
                      <br />C 睇得明你做緊嘅工作，同你一齊將觀察變成行動。
                    </p>
                    <div className="cc-category" aria-label="C 協助方向">
                      {(
                        [
                          ["activity", "建立活動", Sparkles],
                          ["service", "客服與銷售", UsersRound],
                          ["analysis", "分析與營運", Target],
                        ] as const
                      ).map(([id, label, Icon]) => (
                        <button
                          key={id}
                          aria-pressed={category === id}
                          onClick={() => setCategory(id)}
                        >
                          <Icon size={14} />
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="cc-example-grid">
                      {examples[category].map(([title, prompt]) => (
                        <button key={title} onClick={() => example(prompt)}>
                          <b>
                            {title}
                            <ArrowUpRight size={16} />
                          </b>
                          <span>{prompt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="cc-messages">
                    {messages.map((m) => (
                      <article className={`cc-message is-${m.role}`} key={m.id}>
                        {m.role === "assistant" && (
                          <div className="cc-message-author">
                            <BrandMark size={23} />
                            <b>C</b>
                          </div>
                        )}
                        {m.role === "assistant" && m.result ? (
                          <Answer answer={m.result} />
                        ) : (
                          <p>{m.body}</p>
                        )}
                      </article>
                    ))}
                    {c.pending &&
                      !c.pending.proactive &&
                      !messages.some(
                        (m) => m.id === c.pending?.request.requestId,
                      ) && (
                        <article className="cc-message is-user">
                          <p>{c.pending.request.message}</p>
                        </article>
                      )}
                    {c.busy && (
                      <div className="cc-thinking" role="status">
                        <span />
                        <span />
                        <span />
                        <small>
                          {c.pending?.proactive
                            ? "C 正在整理新觀察…"
                            : "C 正在核對資料、串連上下文…"}
                        </small>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {c.error && (
                <p className="cc-feedback is-error" role="alert">
                  {c.error}
                </p>
              )}
              {c.notice && (
                <p className="cc-feedback" role="status">
                  {c.notice}
                </p>
              )}
              {c.pending && !c.busy && (
                <button
                  className="cc-reconcile"
                  onClick={() => void c.ask(c.pending!.request.message)}
                >
                  <RefreshCw size={14} />
                  核對同一個 AI 請求
                </button>
              )}
              {c.uncertain && !c.busy && (
                <button
                  className="cc-reconcile"
                  onClick={() => void c.retryAction()}
                >
                  <RefreshCw size={14} />
                  核對同一個操作
                </button>
              )}
              {b && !b.ai.enabled && (
                <div className="cc-availability">
                  <span>公司 AI 已暫停；觀察同已保存工作仍然保留。</span>
                  {b.ai.canConfigure && (
                    <button
                      disabled={c.busy}
                      onClick={() =>
                        void c.act({ action: "configure", enabled: true })
                      }
                    >
                      啟用 C
                    </button>
                  )}
                </div>
              )}
              <form
                className="cc-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void c.ask(c.composer);
                }}
              >
                <label
                  className="sr-only"
                  htmlFor={compact ? "c-dock-message" : "c-workroom-message"}
                >
                  同 C 講你想做到乜
                </label>
                <textarea
                  ref={input}
                  id={compact ? "c-dock-message" : "c-workroom-message"}
                  value={c.composer}
                  onChange={(e) => c.setComposer(e.target.value)}
                  placeholder={
                    c.context.customerId
                      ? "同 C 傾目前呢位客，或者任何營運問題…"
                      : "例如：幫我搵出值得跟進嘅客群，再一齊諗個活動…"
                  }
                  maxLength={2000}
                  rows={3}
                  disabled={!!c.pending && !c.pending.proactive}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      if (!busyLocked && canGenerate && c.composer.trim())
                        void c.ask(c.composer);
                    }
                  }}
                />
                <div>
                  <span>
                    {c.context.customerId
                      ? "已帶入目前客戶"
                      : "已連結公司工作資料"}
                    {b ? ` · 今日 ${b.ai.used}/${b.ai.limit}` : ""}
                  </span>
                  <button
                    type="submit"
                    className="cc-send"
                    aria-label="交畀 C 處理"
                    disabled={!canGenerate || !c.composer.trim() || busyLocked}
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
              </form>
              <p className="cc-composer-note">
                C 會核對記錄同知識；對外訊息、預約同活動由你確認。
              </p>
            </>
          )}
        </section>
        <aside
          className={`cc-observations${showObservations ? " is-open" : ""}`}
          aria-label="C 工作觀察"
        >
          <div className="cc-observations-heading">
            <span>
              <Sparkles size={16} />
              我留意到
            </span>
            <small>隨你嘅工作更新</small>
            <button
              className="cc-close-observations"
              aria-label="返回 C 對話"
              onClick={() => {
                setShowObservations(false);
                observationToggle.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </div>
          {c.loading && !b ? (
            <p className="cc-status">正在核對工作資料…</p>
          ) : (
            b?.observations.map((o) => (
              <Signal
                key={o.key}
                signal={o}
                onUse={() => {
                  setShowObservations(false);
                  input.current?.focus();
                }}
              />
            ))
          )}
          {b && !b.observations.length && (
            <p className="cc-list-empty">
              暫時未有值得打擾你嘅新觀察。C 會繼續按正式紀錄留意。
            </p>
          )}
          <details className="cc-coverage">
            <summary>資料範圍同限制</summary>
            <p>
              以公司最近 90 日正式查詢、確認預約、已授權 POS
              及有效核准知識為基礎。未接駁來源唔當成零成效，未核實推播紀錄唔當成冇推播。
            </p>
            <p>高轉化建議最少 20 人，並檢查統計區間；仍然只代表關聯。</p>
            {b?.at && <small>最近核對：{time(b.at)} HKT</small>}
          </details>
        </aside>
      </div>
    </div>
  );
}
