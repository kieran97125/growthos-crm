"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Bell, Check, Clock3, Smartphone } from "lucide-react";
import { formatHongKongDateTime } from "@/lib/datetime";
import {
  effectiveNotificationPreferences,
  notificationPushState,
  type NotificationPage,
} from "@/lib/notifications/model";
import { engagementFetcher } from "@/components/engagement/fetcher";
import { useRecordedCommand } from "@/components/engagement/useRecordedCommand";
import "../engagement/engagement.css";
export default function NotificationWorkspace({
  companyId,
  initial,
}: {
  companyId: string;
  initial: NotificationPage;
}) {
  const [cursor, setCursor] = useState(""),
    [deviceBusy, setDeviceBusy] = useState(false),
    [deviceError, setDeviceError] = useState(""),
    url = `/api/companies/${companyId}/notifications`,
    { data, error, mutate } = useSWR<NotificationPage>(
      url + (cursor ? "?" + cursor : ""),
      engagementFetcher,
      { fallbackData: cursor ? undefined : initial, refreshInterval: 10000 },
    ),
    c = useRecordedCommand(url, () => mutate());
  async function enable() {
    if (!data) return;
    setDeviceBusy(true);
    setDeviceError("");
    try {
      if (!data.publicKey) throw Error("裝置推播尚未啟用。");
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        throw Error(
          "呢個瀏覽器未支援裝置推播；iPhone／iPad 可先加入主畫面，再由主畫面開啟。",
        );
      if ((await Notification.requestPermission()) !== "granted")
        throw Error("裝置未授權推播；你仍可喺工作台睇提醒。");
      const registration = await navigator.serviceWorker.register(
          "/convelta-notifications-sw.js",
        ),
        ready = await navigator.serviceWorker.ready;
      if (ready.scope !== registration.scope)
        throw Error("推播服務未準備好，請重新開啟工作台。");
      const key = Uint8Array.from(
        atob(data.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (x) => x.charCodeAt(0),
      );
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const current = subscription.options.applicationServerKey;
        if (
          current &&
          Array.from(new Uint8Array(current)).join(",") !==
            Array.from(key).join(",")
        ) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const j = subscription.toJSON();
      if (!j.endpoint || !j.keys) throw Error("未能讀取裝置訂閱。");
      await c.send({
        action: "device",
        commandId: crypto.randomUUID(),
        endpoint: j.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
        label: "目前裝置",
      });
    } catch (e) {
      setDeviceError(e instanceof Error ? e.message : "未能啟用推播。");
    } finally {
      setDeviceBusy(false);
    }
  }
  if (!data)
    return (
      <main className="eng-work">
        <h1>C 提醒</h1>
        <p role={error ? "alert" : "status"}>
          {error?.message ?? "讀取最新資料中…"}
        </p>
      </main>
    );
  const preferences = effectiveNotificationPreferences(data.preferences.data);
  const pushState = notificationPushState(data);
  const pushLabels = {
    unconfigured: "伺服器尚未配置",
    off: "未啟用",
    no_device: "未有已登記接收裝置",
    ready: "設定就緒",
  };
  return (
    <main className="eng-work">
      <header className="eng-header">
        <div>
          <span className="eng-eyebrow">C REMINDERS</span>
          <h1>有需要跟進，C 會提你</h1>
          <p>根據實際派客、到期跟進同漏覆情況，整理你要留意嘅事。</p>
        </div>
        <Link href={`/company/${companyId}/crm/operations`}>
          開啟跟進工作台
        </Link>
      </header>
      {(error || c.error || deviceError || c.notice) && (
        <p
          className="eng-alert"
          role={error || c.error || deviceError ? "alert" : "status"}
        >
          {error?.message || c.error || deviceError || c.notice}
        </p>
      )}
      {c.frozen && (
        <button disabled={c.busy} onClick={() => void c.retry()}>
          核對同一請求
        </button>
      )}
      <section className="eng-notification-state" aria-label="通知設定狀態">
        <div>
          <span>網站工作台提醒</span>
          <strong>{preferences.website ? "已開啟" : "已關閉"}</strong>
        </div>
        <div>
          <span>裝置推播</span>
          <strong>{pushLabels[pushState]}</strong>
        </div>
        <p>
          網站提醒會顯示喺
          CRM；離開工作台後收推播，亦需要開啟裝置推播及登記接收裝置。
        </p>
      </section>
      <div className="eng-section-title">
        <h2>等待處理</h2>
        <span>{data.total} 項</span>
      </div>
      <section className="eng-campaigns">
        {data.rows.map((n) => (
          <article className="eng-campaign" key={n.id}>
            <div className="eng-campaign-icon">
              <Bell size={20} />
            </div>
            <div className="eng-campaign-main">
              <h2>{n.title}</h2>
              <p>{formatHongKongDateTime(n.created_at, "second")}</p>
              {n.website && (
                <div className="eng-website-context">
                  <strong>
                    {n.website.visitorName} · {n.website.intent}
                  </strong>
                  {n.website.summary && <p>{n.website.summary}</p>}
                  {n.website.unanswered && (
                    <p>待確認：{n.website.unanswered}</p>
                  )}
                  <p>
                    {n.website.humanWaiting
                      ? "客人要求真人回覆"
                      : "網站有新留言"}
                    {n.website.humanRequestedAt
                      ? ` · 等候 ${n.website.waitingMinutes ?? 0} 分鐘`
                      : ""}
                    {n.website.assigneeName
                      ? ` · 接待：${n.website.assigneeName}`
                      : " · 待分派"}
                  </p>
                </div>
              )}
              <Link href={n.href}>
                {n.kind === "website" ? "開啟網站對話 →" : "開啟跟進 →"}
              </Link>
              {n.evidence && (
                <details className="eng-step-details">
                  <summary>觀察來源</summary>
                  <p>{n.evidence.detail}</p>
                  <ul>
                    {n.evidence.evidence.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                  <p>
                    核對時間：
                    {formatHongKongDateTime(n.evidence.checkedAt, "second")}
                    （香港）
                  </p>
                  {n.evidence.facts.map((f) => (
                    <p key={f.id}>
                      <strong>{f.label}</strong>：{f.value}
                      <br />
                      {f.source}
                    </p>
                  ))}
                </details>
              )}
            </div>
            {n.kind !== "website" && (
              <div className="eng-actions">
                <button
                  disabled={c.busy || c.frozen}
                  onClick={() =>
                    void c.send({
                      action: "snooze",
                      commandId: crypto.randomUUID(),
                      id: n.id,
                      revision: n.revision,
                      until: new Date(Date.now() + 3600000).toISOString(),
                    })
                  }
                >
                  <Clock3 size={15} />
                  一小時後
                </button>
                <button
                  disabled={c.busy || c.frozen}
                  onClick={() =>
                    void c.send({
                      action: "done",
                      commandId: crypto.randomUUID(),
                      id: n.id,
                      revision: n.revision,
                    })
                  }
                >
                  <Check size={15} />
                  完成提醒
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
      {!data.rows.length && (
        <section className="eng-empty">
          <Bell size={28} />
          <h2>暫時未有待處理提醒</h2>
          <p>新派客、到期跟進及漏覆會喺呢度顯示。</p>
        </section>
      )}
      <div className="eng-pagination">
        {cursor && <button onClick={() => setCursor("")}>第一頁</button>}
        {data.next && (
          <button onClick={() => setCursor(data.next!)}>下一頁</button>
        )}
      </div>
      <details className="eng-details">
        <summary>
          提醒偏好與裝置<span>由你決定幾時收到通知</span>
        </summary>
        <form
          key={data.preferences.revision}
          className="eng-form-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void c.send({
              action: "preferences",
              commandId: crypto.randomUUID(),
              revision: data.preferences.revision,
              data: {
                assignment: f.has("assignment"),
                followup: f.has("followup"),
                sla: f.has("sla"),
                observation: f.has("observation"),
                website: f.has("website"),
                push: f.has("push"),
                quietStart: Number(f.get("quietStart")),
                quietEnd: Number(f.get("quietEnd")),
              },
            });
          }}
        >
          <fieldset disabled={c.busy || c.frozen}>
            {(
              [
                ["assignment", "新客／對話分派"],
                ["followup", "到期跟進"],
                ["sla", "超過真人回覆目標"],
                ["observation", "C 根據正式紀錄整理嘅觀察"],
                ["website", "網站新查詢及真人接待要求"],
                ["push", "離開工作台後接收裝置推播"],
              ] as const
            ).map(([k, t]) => (
              <label className="eng-check" key={k}>
                <input
                  type="checkbox"
                  name={k}
                  defaultChecked={preferences[k]}
                  disabled={k === "push" && !data.pushConfigured}
                />
                {t}
              </label>
            ))}
            <div className="eng-two">
              <label>
                安靜時段開始（香港）
                <select
                  name="quietStart"
                  defaultValue={data.preferences.data.quietStart}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>
              <label>
                安靜時段結束（香港）
                <select
                  name="quietEnd"
                  defaultValue={data.preferences.data.quietEnd}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button>儲存提醒偏好</button>
          </fieldset>
        </form>
        <p className="eng-hint">
          提醒按工作台紀錄產生，完成提醒後仍可由原有跟進紀錄查閱處理進度。安靜時段只暫停裝置推播；開始及結束相同表示全日開放。
        </p>
        <h3>接收裝置</h3>
        <button
          disabled={!data.pushConfigured || deviceBusy || c.busy || c.frozen}
          onClick={() => void enable()}
        >
          <Smartphone size={15} />
          {deviceBusy ? "設定中…" : "啟用目前裝置"}
        </button>
        {!data.pushConfigured && (
          <p className="eng-hint">裝置推播待伺服器啟用，工作台提醒已可使用。</p>
        )}
        {data.devices.map((d) => (
          <div className="eng-two" key={d.id}>
            <span>
              {d.label} · {d.active ? "已連接" : "已停止"}
            </span>
            {d.active && (
              <button
                disabled={c.busy || c.frozen}
                onClick={() =>
                  void c.send({
                    action: "revoke",
                    commandId: crypto.randomUUID(),
                    id: d.id,
                  })
                }
              >
                停止呢個裝置
              </button>
            )}
          </div>
        ))}
      </details>
    </main>
  );
}
