"use client";
import { useState } from "react";
import useSWR from "swr";
import { operationsFetcher, operationsReadOptions } from "./fetcher";
import { Check, Clock3, Layers3, Plus, X } from "lucide-react";
import AIDraft from "@/components/ai/AIDraft";
import type { CompanyAnswer } from "@/lib/ai/protocol";
import type { Inquiry } from "@/lib/inquiries/model";
import { fromHongKongInput, toHongKongInput } from "@/lib/meta/operations";
import { type OperationsContext, interestNames } from "@/lib/operations/model";
import { useOperationsMutation } from "./useOperationsMutation";

export default function InquiryOperations({
  companyId,
  actorId,
  thread,
  disabled,
  onInsert,
}: {
  companyId: string;
  actorId: string;
  thread: Inquiry;
  disabled: boolean;
  onInsert: (s: string) => void;
}) {
  const [inputError, setInputError] = useState(""),
    [stage, setStage] = useState<{
      id: string;
      reason: string;
      revision: number;
    } | null>(null),
    [task, setTask] = useState({ title: "", at: "" });
  const {
    data,
    error: readError,
    mutate: refresh,
  } = useSWR<OperationsContext>(
    [
      `/api/companies/${companyId}/operations?${new URLSearchParams({ provider: thread.provider, thread: thread.id, revision: String(thread.revision), link: String(thread.link_revision) })}`,
      actorId,
    ],
    operationsFetcher<OperationsContext>,
    operationsReadOptions,
  );
  const error = inputError || readError?.message || "";
  const mutation = useOperationsMutation(companyId, () => {
    void refresh().catch(() => undefined);
  });
  const locked = disabled || mutation.locked || !data?.canEdit;
  const current = data?.stages.find((s) => s.id === data.lifecycle.stage_id);
  async function handoff(answer: CompanyAnswer) {
    if (!data || !answer.requestId) return false;
    return mutation.run({
      action: "handoff",
      commandId: crypto.randomUUID(),
      requestId: answer.requestId,
      provider: thread.provider,
      threadId: thread.id,
      revision: thread.revision,
      customerId: thread.customer_id,
      linkRevision: thread.link_revision,
      lifecycleRevision: data.lifecycle.revision,
      stageId: null,
      reason: "同事核對後採納 AI 交接重點",
    });
  }
  return (
    <>
      <section className="co-context" aria-label="客戶階段與跟進事項">
        <h3>
          <Layers3 size={15} />
          客戶階段
          {current && (
            <span className={`co-stage-badge co-tone-${current.tone}`}>
              <i />
              {current.name}
            </span>
          )}
        </h3>
        {(error || mutation.error) && (
          <p className="co-error" role="alert">
            {mutation.error || error}
          </p>
        )}
        {mutation.notice && (
          <p className="co-status" role="status">
            {mutation.notice}
          </p>
        )}
        {mutation.pending && !mutation.busy && (
          <button
            className="co-secondary"
            onClick={() => void mutation.run(mutation.pending!)}
          >
            核對同一儲存結果
          </button>
        )}
        {data && (
          <>
            <label>
              更新階段
              <select
                aria-label="對話客戶階段"
                disabled={locked}
                value={stage?.id ?? data.lifecycle.stage_id}
                onChange={(e) =>
                  setStage({
                    id: e.target.value,
                    reason: stage?.reason ?? "",
                    revision: stage?.revision ?? data.lifecycle.revision,
                  })
                }
              >
                {data.stages
                  .filter((s) => s.active || s.id === data.lifecycle.stage_id)
                  .map((s) => (
                    <option key={s.id} value={s.id} disabled={!s.active}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            {stage && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutation
                    .run({
                      action: "stage",
                      commandId: crypto.randomUUID(),
                      customerId: data.lifecycle.customer_id,
                      brandId: data.lifecycle.brand_id,
                      revision: stage.revision,
                      stageId: stage.id,
                      reason: stage.reason,
                    })
                    .then((ok) => {
                      if (ok) setStage(null);
                    });
                }}
              >
                <label>
                  原因
                  <input
                    required
                    maxLength={500}
                    disabled={locked}
                    value={stage.reason}
                    onChange={(e) =>
                      setStage({ ...stage, reason: e.target.value })
                    }
                    placeholder="客戶需要或流失原因"
                  />
                </label>
                <div className="co-context-actions">
                  <button
                    className="co-primary"
                    disabled={locked || !stage.reason.trim()}
                  >
                    <Check size={13} />
                    儲存階段
                  </button>
                  <button
                    type="button"
                    className="co-secondary"
                    disabled={mutation.locked}
                    onClick={() => setStage(null)}
                  >
                    取消
                  </button>
                </div>
              </form>
            )}
            {data.handoff && (
              <div className="co-handoff">
                <span>
                  AI 交接 ·{" "}
                  {interestNames[
                    data.handoff.interest as keyof typeof interestNames
                  ] ?? "待了解"}
                </span>
                <p>{data.handoff.summary}</p>
                <small>下一步 · {data.handoff.next_step}</small>
              </div>
            )}
            <details>
              <summary>
                <Plus size={13} />
                新增跟進事項
              </summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  try {
                    const at = fromHongKongInput(task.at);
                    if (!at) throw new Error("請填入跟進時間。");
                    void mutation
                      .run({
                        action: "followup-create",
                        commandId: crypto.randomUUID(),
                        provider: thread.provider,
                        threadId: thread.id,
                        title: task.title,
                        dueAt: at,
                        ownerId: thread.assignee_active
                          ? thread.assignee_id
                          : null,
                      })
                      .then((ok) => {
                        if (ok) setTask({ title: "", at: "" });
                      });
                  } catch (e) {
                    setInputError(
                      e instanceof Error ? e.message : "請核對時間。",
                    );
                  }
                }}
              >
                <label>
                  下一步
                  <input
                    required
                    maxLength={200}
                    disabled={locked}
                    value={task.title}
                    onChange={(e) =>
                      setTask({ ...task, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  香港跟進時間
                  <input
                    required
                    type="datetime-local"
                    disabled={locked}
                    value={task.at}
                    onChange={(e) => setTask({ ...task, at: e.target.value })}
                  />
                </label>
                <button className="co-primary" disabled={locked}>
                  <Plus size={13} />
                  加入跟進
                </button>
              </form>
            </details>
            {data.followups.map((f) => (
              <div className="co-context-task" key={f.id}>
                <div>
                  <Clock3 size={12} />
                  <strong>{f.title}</strong>
                  <button
                    className="co-icon"
                    aria-label={`完成 ${f.title}`}
                    disabled={
                      locked ||
                      (!!f.owner_id &&
                        f.owner_active !== false &&
                        f.owner_id !== data.actorId &&
                        !data.canManage)
                    }
                    onClick={() =>
                      void mutation.run({
                        action: "followup-update",
                        commandId: crypto.randomUUID(),
                        id: f.id,
                        revision: f.revision,
                        status: "done",
                        dueAt: null,
                      })
                    }
                  >
                    <Check size={13} />
                  </button>
                  <button
                    className="co-icon"
                    aria-label={`取消 ${f.title}`}
                    disabled={
                      locked ||
                      (!!f.owner_id &&
                        f.owner_active !== false &&
                        f.owner_id !== data.actorId &&
                        !data.canManage)
                    }
                    onClick={() =>
                      void mutation.run({
                        action: "followup-update",
                        commandId: crypto.randomUUID(),
                        id: f.id,
                        revision: f.revision,
                        status: "cancelled",
                        dueAt: null,
                      })
                    }
                  >
                    <X size={12} />
                  </button>
                </div>
                <time>
                  {toHongKongInput(f.due_at).replace("T", " ")} ·{" "}
                  {f.owner_name || "待認領"}
                </time>
              </div>
            ))}
          </>
        )}
      </section>
      <AIDraft
        context={{
          companyId,
          brandId: thread.brand_id,
          source: thread.provider,
          threadId: thread.id,
        }}
        disabled={disabled || mutation.locked}
        onInsert={onInsert}
        onHandoff={data?.canEdit ? handoff : undefined}
      />
    </>
  );
}
