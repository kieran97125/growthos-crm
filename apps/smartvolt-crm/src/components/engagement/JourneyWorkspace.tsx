"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  CalendarClock,
  Clock3,
  HeartHandshake,
  Plus,
  Workflow,
  X,
} from "lucide-react";
import {
  recipeNames,
  recipeDescriptions,
  journeyAction,
  type JourneyPage,
} from "@/lib/engagement/journeys";
import type { EngagementPage } from "@/lib/engagement/model";
import { engagementFetcher } from "./fetcher";
import JourneyBuilder from "./JourneyBuilder";
import JourneyHistory from "./JourneyHistory";
import "./engagement.css";
type Recipe = keyof typeof recipeNames;
const icons = {
  unanswered: Clock3,
  appointment: CalendarClock,
  completed: HeartHandshake,
};
export default function JourneyWorkspace({
  companyId,
  initial,
  engagement,
}: {
  companyId: string;
  initial: JourneyPage;
  engagement: EngagementPage;
}) {
  const [recipe, setRecipe] = useState<Recipe | null>(null),
    [history, setHistory] = useState<{ id: string; name: string } | null>(null),
    [cursor, setCursor] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [frozen, setFrozen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef<ReturnType<typeof journeyAction.parse> | null>(null),
    endpoint = `/api/companies/${companyId}/journeys`;
  const {
    data,
    error: readError,
    mutate,
  } = useSWR<JourneyPage>(endpoint + "?" + cursor, engagementFetcher, {
    fallbackData: cursor ? undefined : initial,
    refreshInterval: 15000,
    keepPreviousData: false,
  });
  useEffect(() => {
    if (recipe && !dialog.current?.open) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    }
  }, [recipe]);
  async function send(raw: unknown) {
    if (busy) return;
    let c;
    try {
      c = journeyAction.parse(raw);
    } catch {
      setError("請核對名稱、模板欄位及跟進時間。每次跟進最少相隔五分鐘。");
      return;
    }
    pending.current = c;
    setFrozen(true);
    setBusy(true);
    setError("");
    try {
      const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(c),
        }),
        d = await r.json();
      if (!r.ok) {
        if (r.status < 500) {
          pending.current = null;
          setFrozen(false);
        }
        throw Error(d.error);
      }
      pending.current = null;
      setFrozen(false);
      dialog.current?.close();
      setRecipe(null);
      setNotice(
        c.action === "publish"
          ? "流程已啟用。每次執行都會核對最新客戶狀態。"
          : "流程設定已更新。",
      );
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能儲存。請核對同一請求。");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <main className="eng-work">
        <h1>自動追客</h1>
        <p role={readError ? "alert" : "status"}>
          {readError?.message ?? "讀取流程中…"}
        </p>
      </main>
    );
  return (
    <main className="eng-work">
      <header className="eng-header">
        <div>
          <span className="eng-eyebrow">AUTOMATED FOLLOW-UP</span>
          <h1>自動追客</h1>
          <p>喺關鍵時候幫你跟進；客人回覆或真人接手，舊訊息就會停低。</p>
        </div>
        <Link
          className="eng-advanced-link"
          href={`/company/${companyId}/crm?view=flows`}
        >
          進階 Flow 設計
          <Workflow size={15} />
        </Link>
      </header>
      {(error || notice || readError) && (
        <p
          className={error || readError ? "eng-alert" : "eng-notice"}
          role={error || readError ? "alert" : "status"}
        >
          {error || readError?.message || notice}
        </p>
      )}
      {frozen && !recipe && (
        <button
          disabled={busy}
          onClick={() => pending.current && void send(pending.current)}
        >
          核對同一請求
        </button>
      )}
      <section className="eng-recipes" aria-label="選擇自動跟進類型">
        {(Object.keys(recipeNames) as Recipe[]).map((id) => {
          const Icon = icons[id];
          return (
            <article key={id}>
              <span>
                <Icon size={23} />
              </span>
              <h2>{recipeNames[id]}</h2>
              <p>{recipeDescriptions[id]}</p>
              {data.canManage && (
                <button
                  disabled={
                    busy || frozen || (id === "completed" && !data.hasPos)
                  }
                  onClick={() => {
                    setError("");
                    pending.current = null;
                    setRecipe(id);
                  }}
                >
                  <Plus size={15} />
                  {id === "completed" && !data.hasPos ? "需要 POS" : "設定流程"}
                </button>
              )}
            </article>
          );
        })}
      </section>
      <div className="eng-section-title">
        <h2>使用中嘅流程</h2>
        <span>每個版本都有獨立執行紀錄</span>
      </div>
      {data.journeys.length ? (
        <div className="eng-campaigns">
          {data.journeys.map((j) => (
            <article className="eng-campaign" key={j.id}>
              <div className="eng-campaign-icon">
                <Workflow size={21} />
              </div>
              <div className="eng-campaign-main">
                <h2>{j.name}</h2>
                <p>
                  {recipeNames[j.recipe]} · 第 {j.published_version} 版 ·{" "}
                  {j.steps.length} 次跟進
                </p>
                <div className="eng-tags">
                  <span>{j.enabled ? "已啟用" : "已暫停"}</span>
                  {j.segment_id && <span>已套用自動分眾</span>}
                  <span>{j.active_runs} 個跟進中</span>
                  <span>{j.accepted} 則獲平台接納</span>
                </div>
                <details className="eng-step-details">
                  <summary>查看跟進時間及內容</summary>
                  {j.steps.map((s, i) => (
                    <p key={i}>
                      {j.recipe === "appointment" ? "預約前" : "之後"}{" "}
                      {s.delayMinutes} 分鐘 ·{" "}
                      {s.definition.kind === "template"
                        ? s.definition.name
                        : s.definition.body}
                    </p>
                  ))}
                </details>
              </div>
              <button onClick={() => setHistory({ id: j.id, name: j.name })}>
                執行紀錄
              </button>
              {data.canManage && (
                <button
                  disabled={busy || frozen}
                  onClick={() =>
                    void send({
                      action: "toggle",
                      commandId: crypto.randomUUID(),
                      id: j.id,
                      revision: j.revision,
                      enabled: !j.enabled,
                    })
                  }
                >
                  {j.enabled ? "暫停" : "重新啟用"}
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="eng-empty eng-small-empty">
          <h2>由最常用嘅跟進開始</h2>
          <p>揀選上面其中一個情境，設定訊息同時間就可以啟用。</p>
        </section>
      )}
      <div className="eng-pagination">
        {cursor && <button onClick={() => setCursor("")}>最新流程</button>}
        {data.nextCursor && (
          <button onClick={() => setCursor(data.nextCursor!)}>較早流程</button>
        )}
      </div>
      <p className="eng-hint">
        已排程工作會跟公司發送節奏執行；未獲同意、超過回覆時限或來源已改變嘅訊息會停止，並保留原因。
      </p>
      {history && (
        <JourneyHistory
          key={history.id}
          companyId={companyId}
          journey={history}
          onClose={() => setHistory(null)}
        />
      )}
      <dialog
        ref={dialog}
        aria-labelledby="eng-new-journey"
        className="eng-dialog"
        onClose={() => setRecipe(null)}
      >
        <div className="eng-dialog-head">
          <div>
            <span className="eng-eyebrow">NEW JOURNEY</span>
            <h2 id="eng-new-journey">
              {recipe ? recipeNames[recipe] : "自動追客"}
            </h2>
          </div>
          <button
            aria-label="關閉流程設定"
            disabled={busy}
            onClick={() => {
              dialog.current?.close();
              setRecipe(null);
            }}
          >
            <X size={20} />
          </button>
        </div>
        {recipe && (
          <JourneyBuilder
            key={recipe}
            companyId={companyId}
            recipe={recipe}
            engagement={engagement}
            busy={busy}
            frozen={frozen}
            error={error}
            onSubmit={send}
            onRetry={() => pending.current && void send(pending.current)}
          />
        )}
      </dialog>
    </main>
  );
}
