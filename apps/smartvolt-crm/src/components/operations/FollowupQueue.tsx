"use client";
import Link from "next/link";
import { useEffect } from "react";
import useSWRInfinite from "swr/infinite";
import { operationsFetcher, operationsReadOptions } from "./fetcher";
import { ArrowUpRight, Check, Clock3 } from "lucide-react";
import {
  type OperationsPage,
  type FollowupPage,
  inquiryHref,
} from "@/lib/operations/model";
import type { useOperationsMutation } from "./useOperationsMutation";
import { when } from "./format";
type Mutation = ReturnType<typeof useOperationsMutation>;

export default function FollowupQueue({
  page,
  companyId,
  mutation,
  brand,
}: {
  page: OperationsPage;
  companyId: string;
  mutation: Mutation;
  brand: string;
}) {
  const {
    data: pages,
    error,
    isValidating,
    size,
    setSize,
    mutate,
  } = useSWRInfinite<FollowupPage>(
    (i, prev: FollowupPage | null) =>
      i && !prev?.nextCursor
        ? null
        : [
            `/api/companies/${companyId}/operations?${new URLSearchParams({ mode: "followups", ...(brand ? { brand } : {}), ...(i ? { after: prev!.nextCursor! } : {}) })}`,
            page.actorId,
          ],
    operationsFetcher<FollowupPage>,
    { ...operationsReadOptions, revalidateAll: true, refreshInterval: 60000 },
  );
  const tasks = [
    ...new Map(
      (pages ?? []).flatMap((p) => p.tasks).map((t) => [t.id, t]),
    ).values(),
  ];
  const total = pages?.[0]?.total ?? page.followupCount;
  useEffect(() => {
    const changed = () => {
      void mutate().catch(() => undefined);
    };
    window.addEventListener("convelta:data-changed", changed);
    return () => window.removeEventListener("convelta:data-changed", changed);
  }, [mutate]);
  return (
    <section className="co-followups">
      <div className="co-list-heading">
        <h2>
          下一步，跟到實。<small>{total} 項待處理</small>
        </h2>
        <Link
          className="co-secondary"
          href={`/company/${companyId}/crm?queue=overdue`}
        >
          查看到期對話 <ArrowUpRight size={14} />
        </Link>
      </div>
      {error && (
        <p className="co-error" role="alert">
          {error.message}
        </p>
      )}
      {tasks.length ? (
        tasks.map((f) => (
          <article key={f.id} className="co-task">
            <span className="co-task-icon">
              <Clock3 size={18} />
            </span>
            <div>
              <Link href={inquiryHref(companyId, f.provider, f.thread_id)}>
                {f.title}
                <ArrowUpRight size={13} />
              </Link>
              <p>
                {f.name} · {f.owner_name || "待認領"}
              </p>
              <time>{when(f.due_at)}</time>
            </div>
            <div className="co-task-actions">
              <button
                className="co-secondary"
                disabled={!page.canEdit || mutation.locked}
                onClick={() =>
                  void mutation.run({
                    action: "followup-update",
                    commandId: crypto.randomUUID(),
                    id: f.id,
                    revision: f.revision,
                    status: "open",
                    dueAt: new Date(Date.now() + 3600000).toISOString(),
                  })
                }
              >
                延後 1 小時
              </button>
              <button
                className="co-primary"
                disabled={!page.canEdit || mutation.locked}
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
                <Check size={15} />
                完成
              </button>
            </div>
          </article>
        ))
      ) : (
        <div className="co-empty">
          <Check size={30} />
          <h2>
            {!pages && isValidating ? "正在讀取跟進事項…" : "暫時未有跟進事項"}
          </h2>
          <p>喺對話內加入下一步，或者啟用階段跟進流程。</p>
        </div>
      )}
      {pages?.at(-1)?.nextCursor && (
        <button
          className="co-load"
          disabled={isValidating}
          onClick={() => void setSize(size + 1).catch(() => undefined)}
        >
          載入更多跟進
        </button>
      )}
    </section>
  );
}
