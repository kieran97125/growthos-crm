"use client";
import Link from "next/link";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronRight,
  Layers3,
  Search,
  X,
} from "lucide-react";
import {
  type OperationsPage,
  type LifecycleRecord,
  inquiryHref,
  interestNames,
} from "@/lib/operations/model";
import type { useOperationsMutation } from "./useOperationsMutation";
import { when, money } from "./format";
type Mutation = ReturnType<typeof useOperationsMutation>;

export default function OperationsPipeline({
  page,
  companyId,
  stage,
  setStage,
  search,
  setSearch,
  input,
  setInput,
  editing,
  setEditing,
  mutation,
  loading,
  loadMore,
}: {
  page: OperationsPage;
  companyId: string;
  stage: string;
  setStage: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
  input: string;
  setInput: (s: string) => void;
  editing: { record: LifecycleRecord; stage: string; reason: string } | null;
  setEditing: Dispatch<
    SetStateAction<{
      record: LifecycleRecord;
      stage: string;
      reason: string;
    } | null>
  >;
  mutation: Mutation;
  loading: boolean;
  loadMore: () => Promise<void>;
}) {
  const total = page.stages.reduce((n, s) => n + s.count, 0);
  const editor = useRef<HTMLFormElement>(null);
  const editingKey = editing?.record.key;
  useEffect(() => {
    if (editingKey && editor.current) {
      editor.current.scrollIntoView({ block: "nearest" });
      editor.current
        .querySelector<HTMLInputElement>("input")
        ?.focus({ preventScroll: true });
    }
  }, [editingKey]);
  return (
    <section className="co-pipeline" aria-label="客戶階段與名單">
      <div className="co-stages">
        <button
          className="co-stage co-stage-all"
          aria-pressed={!stage}
          onClick={() => setStage("")}
        >
          <span>全部客戶</span>
          <strong>{total}</strong>
          <small>目前階段</small>
        </button>
        {page.stages
          .filter((s) => s.active || s.count)
          .map((s) => (
            <button
              key={s.id}
              className={`co-stage co-tone-${s.tone}`}
              aria-pressed={stage === s.id}
              onClick={() => setStage(stage === s.id ? "" : s.id)}
            >
              <span>
                <i />
                {s.name}
              </span>
              <strong>{s.count}</strong>
              <div className="co-stage-track">
                <i
                  style={{
                    width: `${total ? (s.count / total) * 100 : 0}%`,
                  }}
                />
              </div>
            </button>
          ))}
      </div>
      <div className="co-list-heading">
        <h2>
          {stage ? page.stages.find((s) => s.id === stage)?.name : "客戶進度"}
          <small>{page.metrics.unassigned} 段對話待分派</small>
        </h2>
        <form
          className="co-search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(input);
          }}
        >
          <Search size={15} />
          <input
            aria-label="搜尋營運客戶"
            placeholder="搜尋客戶"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit">搜尋</button>
        </form>
      </div>
      {editing && (
        <form
          className="co-inline-editor"
          ref={editor}
          aria-label="更新客戶階段"
          onSubmit={(e) => {
            e.preventDefault();
            void mutation
              .run({
                action: "stage",
                commandId: crypto.randomUUID(),
                customerId: editing.record.customer_id,
                brandId: editing.record.brand_id,
                revision: editing.record.revision,
                stageId: editing.stage,
                reason: editing.reason,
              })
              .then((ok) => {
                if (ok) setEditing(null);
              });
          }}
        >
          <div>
            <strong>{editing.record.name}</strong>
            <button
              type="button"
              className="co-icon"
              aria-label="取消階段修改"
              disabled={mutation.locked}
              onClick={() => setEditing(null)}
            >
              <X size={16} />
            </button>
          </div>
          <label>
            階段
            <select
              aria-label="階段"
              value={editing.stage}
              disabled={mutation.locked}
              onChange={(e) =>
                setEditing({ ...editing, stage: e.target.value })
              }
            >
              {page.stages
                .filter((s) => s.active || s.id === editing.record.stage_id)
                .map((s) => (
                  <option key={s.id} value={s.id} disabled={!s.active}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            原因
            <input
              required
              maxLength={500}
              placeholder="記低客戶情況或流失原因"
              disabled={mutation.locked}
              value={editing.reason}
              onChange={(e) =>
                setEditing({ ...editing, reason: e.target.value })
              }
            />
          </label>
          <button
            className="co-primary"
            disabled={mutation.locked || !editing.reason.trim()}
          >
            <Check size={15} />
            儲存階段
          </button>
        </form>
      )}
      {page.records.length ? (
        <div className="co-table-scroll">
          <table className="co-table">
            <thead>
              <tr>
                <th>客戶</th>
                <th>階段</th>
                <th>跟進重點</th>
                <th>負責同事</th>
                <th>
                  <span className="co-sr">開啟</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.records.map((r) => {
                const s = page.stages.find((s) => s.id === r.stage_id);
                return (
                  <tr key={r.key}>
                    <td>
                      <strong>{r.name}</strong>
                      <small>
                        {page.brands.find((b) => b.id === r.brand_id)?.name ??
                          r.brand_id}
                      </small>
                    </td>
                    <td>
                      <button
                        className={`co-stage-badge co-tone-${s?.tone ?? "slate"}`}
                        disabled={!page.canEdit || mutation.locked}
                        onClick={() =>
                          setEditing({
                            record: r,
                            stage: r.stage_id,
                            reason: "",
                          })
                        }
                      >
                        <i />
                        {s?.name ?? r.stage_id}
                        <ChevronRight size={12} />
                      </button>
                    </td>
                    <td>
                      <span className="co-next">
                        {r.next_step || r.reason || "待了解客戶需要"}
                      </span>
                      {r.interest && (
                        <small className="co-ai-interest">
                          AI ·{" "}
                          {interestNames[
                            r.interest as keyof typeof interestNames
                          ] ?? "待了解"}
                        </small>
                      )}
                    </td>
                    <td>
                      <span>{r.owner_name || "待分派"}</span>
                      {r.follow_up_at && <small>{when(r.follow_up_at)}</small>}
                    </td>
                    <td>
                      {r.provider && r.thread_id ? (
                        <Link
                          className="co-row-link"
                          href={inquiryHref(companyId, r.provider, r.thread_id)}
                          aria-label={`開啟 ${r.name} 對話`}
                        >
                          <ArrowUpRight size={17} />
                        </Link>
                      ) : (
                        <Link
                          className="co-row-link"
                          href={`/company/${companyId}/crm/customers?contact=${encodeURIComponent(r.customer_id)}`}
                          aria-label={`開啟 ${r.name} 檔案`}
                        >
                          <ArrowUpRight size={17} />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="co-empty">
          <Layers3 size={30} />
          <h2>{search || stage ? "未有符合嘅客戶" : "由第一個查詢開始"}</h2>
          <p>
            {search || stage
              ? "調整階段或搜尋條件。"
              : "客戶進入收件匣後，就會出現喺呢度。"}
          </p>
          <Link href={`/company/${companyId}/crm`} className="co-primary">
            前往收件匣
            <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
      {page.nextCursor && (
        <button
          className="co-load"
          disabled={loading}
          onClick={() => void loadMore()}
        >
          載入更多客戶 <ArrowDownToLine size={14} />
        </button>
      )}
      {page.hasPos && (
        <div className="co-receipts">
          <span>
            已核實收款 <strong>{money(page.metrics.receivedCents ?? 0)}</strong>
          </span>
          <span>
            已核實退款 <strong>{money(page.metrics.refundedCents ?? 0)}</strong>
          </span>
          <details>
            <summary>成效口徑</summary>
            <p>
              查詢按建立時間；預約及到店按系統首次記錄確認／到店嘅時間；款項按原始收款／退款時間。階段標籤及
              AI 意向不計作實際成交。
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
