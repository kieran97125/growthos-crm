"use client";
import { useState, type ReactNode } from "react";
import { Clock3, Flag, UserRound, ArrowUpRight, History } from "lucide-react";
import {
  type InboxMember,
  type ThreadOperations,
  type ThreadActivity,
  fromHongKongInput,
  toHongKongInput,
  operationsOf,
  priorityNames,
} from "@/lib/meta/operations";

type Command = {
  action: "manage";
  threadId: string;
  commandId: string;
  revision: number;
  data: ThreadOperations;
};
export type OperationDraft = {
  data: ThreadOperations;
  baseline: string;
  pending?: Command;
};
const time = (s: string) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(s));
const memberName = (id: string | null, members: InboxMember[]) =>
  id
    ? (members.find((m) => m.user_id === id)?.display_name ??
      "已離職／停用同事")
    : "未分派";
function changes(a: ThreadActivity, members: InboxMember[]) {
  const p = a.previous,
    n = a.next,
    out: string[] = [];
  if (p.assignee_id !== n.assignee_id)
    out.push(
      `負責人：${memberName(p.assignee_id, members)} → ${memberName(n.assignee_id, members)}`,
    );
  if (p.priority !== n.priority)
    out.push(`優先次序：${priorityNames[n.priority]}`);
  if (p.follow_up_at !== n.follow_up_at)
    out.push(
      n.follow_up_at ? `跟進時間：${time(n.follow_up_at)}` : "已清除跟進時間",
    );
  if (p.next_step !== n.next_step)
    out.push(n.next_step ? `下一步：${n.next_step}` : "已清除下一步");
  if (p.customer_name !== n.customer_name)
    out.push(
      n.customer_name ? `客戶名稱：${n.customer_name}` : "已清除客戶名稱",
    );
  if (p.status !== n.status)
    out.push(n.status === "resolved" ? "標記已處理" : "重新跟進");
  return out.length ? out : ["確認跟進資料"];
}

export default function ThreadOperationsPanel({
  thread,
  members,
  actorId,
  canEdit,
  busy,
  now,
  activity,
  cached,
  onDraft,
  onSave,
  assistant,
}: {
  thread: ThreadOperations & { id: string; revision: number };
  members: InboxMember[];
  actorId: string;
  canEdit: boolean;
  busy: boolean;
  now: number;
  activity: ThreadActivity[];
  cached?: OperationDraft;
  onDraft: (draft?: OperationDraft) => void;
  onSave: (command: Command) => Promise<boolean | undefined>;
  assistant?: ReactNode;
}) {
  const [draft, setDraft] = useState<OperationDraft | undefined>(cached);
  const [pending, setPending] = useState<Command | null>(
    cached?.pending ?? null,
  );
  const [validation, setValidation] = useState("");
  const current = operationsOf(thread),
    baseline = JSON.stringify(current);
  const value = draft?.data ?? current;
  const dirty = !!draft && JSON.stringify(value) !== draft.baseline;
  const conflict = dirty && draft.baseline !== baseline;
  const disabled = !canEdit || busy || !!pending;
  const overdue =
    thread.status === "open" &&
    !!thread.follow_up_at &&
    new Date(thread.follow_up_at).getTime() <= now;
  function update(patch: Partial<ThreadOperations>) {
    const next = {
      data: { ...value, ...patch },
      baseline: draft?.baseline ?? baseline,
    };
    setDraft(next);
    onDraft(next);
    setValidation("");
  }
  async function save() {
    if (busy || (!pending && conflict)) return;
    const command: Command = pending ?? {
      action: "manage",
      threadId: thread.id,
      commandId: crypto.randomUUID(),
      revision: thread.revision,
      data: value,
    };
    setPending(command);
    const retained = {
      data: value,
      baseline: draft?.baseline ?? baseline,
      pending: command,
    };
    onDraft(retained);
    const result = await onSave(command);
    // Keep the command ID on a lost response; replay confirms the existing
    // transaction instead of creating a second handover event.
    if (result) {
      setPending(null);
      setDraft(undefined);
      onDraft();
    } else if (result === false) {
      setPending(null);
      onDraft({ data: value, baseline: draft?.baseline ?? baseline });
    }
  }
  return (
    <aside className="meta-operations" aria-label="查詢跟進">
      <div className="meta-operations-title">
        <span>下一步</span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </div>
      <h2>每個查詢，有人跟到底。</h2>
      {assistant}
      {overdue && (
        <p className="meta-due-banner">
          <Clock3 size={15} aria-hidden="true" />
          已到跟進時間 · {time(thread.follow_up_at!)}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={disabled}>
          <label>
            客戶名稱
            <input
              value={value.customer_name}
              maxLength={100}
              placeholder="為呢位客戶加個稱呼"
              onChange={(e) => update({ customer_name: e.target.value })}
            />
          </label>
          <label>
            <span>
              <UserRound size={14} aria-hidden="true" />
              負責同事
            </span>
            <select
              value={value.assignee_id ?? ""}
              onChange={(e) => update({ assignee_id: e.target.value || null })}
            >
              <option value="">未分派</option>
              {value.assignee_id &&
                !members.some((m) => m.user_id === value.assignee_id) && (
                  <option value={value.assignee_id}>
                    已離職／停用同事（請重新分派）
                  </option>
                )}
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                  {m.user_id === actorId ? "（我）" : ""}
                </option>
              ))}
            </select>
          </label>
          {value.assignee_id !== actorId &&
            members.some((m) => m.user_id === actorId) && (
              <button
                type="button"
                className="meta-claim"
                onClick={() => update({ assignee_id: actorId })}
              >
                由我跟進
              </button>
            )}
          <label>
            <span>
              <Flag size={14} aria-hidden="true" />
              優先次序
            </span>
            <select
              value={value.priority}
              onChange={(e) =>
                update({
                  priority: e.target.value as ThreadOperations["priority"],
                })
              }
            >
              {Object.entries(priorityNames).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              <Clock3 size={14} aria-hidden="true" />
              下次跟進（香港時間）
            </span>
            <input
              type="datetime-local"
              value={toHongKongInput(value.follow_up_at)}
              onChange={(e) => {
                try {
                  update({ follow_up_at: fromHongKongInput(e.target.value) });
                } catch (err) {
                  setValidation((err as Error).message);
                }
              }}
            />
          </label>
          <label>
            下一步行動
            <textarea
              rows={3}
              maxLength={500}
              value={value.next_step}
              placeholder="例如：確認需要、準備方案、安排示範…"
              onChange={(e) => update({ next_step: e.target.value })}
            />
          </label>
          <label>
            查詢狀態
            <select
              value={value.status}
              onChange={(e) =>
                update({ status: e.target.value as ThreadOperations["status"] })
              }
            >
              <option value="open">跟進中</option>
              <option value="resolved">已處理</option>
            </select>
          </label>
        </fieldset>
        {validation && (
          <p role="alert" className="meta-inline-warning">
            {validation}
          </p>
        )}
        {conflict && !pending && (
          <p role="alert" className="meta-inline-warning">
            同事已更新跟進資料。你嘅草稿仍然保留，請核對最新資料後再修改。
          </p>
        )}
        {canEdit && (
          <div className="meta-operation-actions">
            <button
              type="submit"
              className="meta-primary"
              disabled={
                busy || !!validation || (!pending && (!dirty || conflict))
              }
            >
              {busy ? "儲存中…" : pending ? "核對儲存結果" : "儲存跟進"}
            </button>
            {(dirty || pending) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraft(undefined);
                  setPending(null);
                  onDraft();
                  setValidation("");
                }}
              >
                讀取最新資料
              </button>
            )}
          </div>
        )}
        <p className="meta-operation-hint">
          {canEdit
            ? dirty || pending
              ? "有改動待確認儲存"
              : "已同步公司跟進資料"
            : "你目前只有檢視權限"}{" "}
          · 跟進時間只在收件匣提示。
        </p>
      </form>
      <details className="meta-activity" open={activity.length > 0}>
        <summary>
          <History size={14} aria-hidden="true" />
          交接記錄{" "}
          <span>{activity.length === 20 ? "最近 20 筆" : activity.length}</span>
        </summary>
        {!activity.length ? (
          <p>儲存跟進後，團隊交接記錄會顯示喺呢度。</p>
        ) : (
          <ol>
            {activity.map((a) => (
              <li key={a.command_id}>
                <b>{a.actor_name}</b>
                <time dateTime={a.created_at}>{time(a.created_at)}</time>
                {changes(a, members).map((text, i) => (
                  <p key={i}>{text}</p>
                ))}
              </li>
            ))}
          </ol>
        )}
      </details>
    </aside>
  );
}
