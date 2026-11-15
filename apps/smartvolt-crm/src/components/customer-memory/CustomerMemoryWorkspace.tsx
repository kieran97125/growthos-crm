"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  Archive,
  Check,
  ChevronDown,
  History,
  LoaderCircle,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import {
  memoryCategoryNames,
  type CustomerMemory,
  type CustomerMemoryPage,
  type MemoryCategory,
  type MemoryCommand,
  type MemoryTimelineItem,
} from "@/lib/customer-memory/model";
import {
  MemoryRequestError,
  memoryRequest,
  readMemoryPage,
  readMemoryDraft,
  updateMemoryDraft,
  useMemoryDraft,
  type MemoryEditor,
} from "./client";
import MemoryTimeline, { memoryTime } from "./MemoryTimeline";
import "./customer-memory.css";

type OlderPage = {
  items: MemoryTimelineItem[];
  nextCursor: string | null;
  busy: boolean;
  error: string;
};
const categories = Object.keys(memoryCategoryNames) as MemoryCategory[];

function RevisionHistory({ items }: { items: CustomerMemory[] }) {
  return (
    <ol className="cm-revisions">
      {items.map((item) => (
        <li key={item.id + ":" + item.revision}>
          <div className="cm-revision-line">
            <b>
              v{item.revision} ·{" "}
              {item.status === "archived" ? "已封存" : "已記錄"}
            </b>
            <time dateTime={item.updatedAt}>{memoryTime(item.updatedAt)}</time>
          </div>
          <p>{item.content}</p>
          <small>{item.reason}</small>
          <small>{item.actorName || item.source.label}</small>
        </li>
      ))}
    </ol>
  );
}

function MemoryEditorForm({
  editor,
  frozen,
  busy,
  onEdit,
  onSubmit,
  onCancel,
}: {
  editor: MemoryEditor;
  frozen: boolean;
  busy: boolean;
  onEdit: (patch: Partial<MemoryEditor>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const archiving = editor.action === "archive";
  const reasonLabel = archiving
    ? "封存原因"
    : editor.expectedRevision
      ? "修改原因"
      : "確認依據";
  return (
    <form
      className="cm-editor"
      onSubmit={onSubmit}
      aria-label={archiving ? "封存客戶記憶" : "編輯客戶記憶"}
    >
      <header>
        <strong>
          {archiving
            ? "封存記憶"
            : editor.expectedRevision
              ? "修改記憶"
              : "新增記憶"}
        </strong>
        <button
          type="button"
          className="cm-icon"
          aria-label="取消編輯"
          disabled={busy || frozen}
          onClick={onCancel}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>
      <fieldset disabled={busy || frozen}>
        {!archiving ? (
          <>
            <label>
              記憶類別
              <select
                aria-label="記憶類別"
                value={editor.category}
                onChange={(e) =>
                  onEdit({ category: e.target.value as MemoryCategory })
                }
              >
                {categories.map((category) => (
                  <option value={category} key={category}>
                    {memoryCategoryNames[category]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              記憶內容
              <textarea
                aria-label="記憶內容"
                value={editor.content}
                onChange={(e) => onEdit({ content: e.target.value })}
                maxLength={1000}
                required
                rows={4}
                placeholder="例如：偏好平日傍晚到店，聯絡前先傳訊息。"
              />
            </label>
          </>
        ) : (
          <p className="cm-archive-content">{editor.content}</p>
        )}
        <label>
          {reasonLabel}
          <textarea
            aria-label={reasonLabel}
            value={editor.reason}
            onChange={(e) => onEdit({ reason: e.target.value })}
            minLength={3}
            maxLength={300}
            required
            rows={2}
            placeholder={
              archiving
                ? "呢項記憶點解唔再適用？"
                : "記低客人確認嘅內容，或核對資料嘅來源。"
            }
          />
        </label>
        <div className="cm-editor-foot">
          <small>{archiving ? "歷史記錄會保留。" : "只記錄已核實資料。"}</small>
          <button
            className={archiving ? "cm-archive-button" : "cm-primary"}
            type="submit"
            disabled={
              busy ||
              frozen ||
              editor.reason.trim().length < 3 ||
              (!archiving && !editor.content.trim())
            }
          >
            {busy ? (
              <LoaderCircle size={14} className="cm-spin" aria-hidden="true" />
            ) : archiving ? (
              <Archive size={14} aria-hidden="true" />
            ) : (
              <Check size={14} aria-hidden="true" />
            )}
            {archiving ? "確認封存" : "儲存記憶"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function ScopedMemory({
  companyId,
  customerId,
  page,
  readUrl,
  endpoint,
  canEdit,
  view,
  refreshing,
  onRefresh,
}: {
  companyId: string;
  customerId: string;
  page: CustomerMemoryPage;
  readUrl: string;
  endpoint: string;
  canEdit: boolean;
  view: "memory" | "timeline";
  refreshing: boolean;
  onRefresh: () => Promise<CustomerMemoryPage | undefined>;
}) {
  const scope = `${companyId}:${customerId}:${page.brandId}`;
  const state = useMemoryDraft(scope);
  const { mutate: mutateCache } = useSWRConfig();
  const [older, setOlder] = useState<Record<string, OlderPage>>({});
  const firstStamps = useRef(new Map<string, string>());
  const firstStamp = page.timeline.map((item) => item.id).join("|");
  const olderPage = older[scope];
  const mayEdit = canEdit && page.canEdit;
  useEffect(() => {
    const previous = firstStamps.current.get(scope);
    firstStamps.current.set(scope, firstStamp);
    if (previous !== undefined && previous !== firstStamp) {
      setOlder((previousPages) => {
        const next = { ...previousPages };
        delete next[scope];
        return next;
      });
    }
  }, [scope, firstStamp]);

  async function send(command: MemoryCommand) {
    if (!mayEdit || readMemoryDraft(scope).busy) return;
    const original = readMemoryDraft(scope).pending ?? command;
    updateMemoryDraft(scope, {
      pending: original,
      busy: true,
      error: "",
      notice: "",
      conflict: false,
    });
    try {
      await memoryRequest(endpoint, original);
      updateMemoryDraft(scope, {
        pending: null,
        editor: null,
        error: "",
        notice:
          original.action === "archive"
            ? "記憶已封存，歷史記錄已保留。"
            : "記憶已儲存。",
      });
      // Revalidate the exact URL captured by this request, even if the user
      // has since selected a different customer or brand.
      try {
        await mutateCache<CustomerMemoryPage>(readUrl);
      } catch {
        updateMemoryDraft(scope, {
          notice: "已儲存，暫時未能更新畫面；請重新讀取。",
        });
      }
      window.dispatchEvent(new Event("convelta:data-changed"));
    } catch (error) {
      const known = error instanceof MemoryRequestError && error.status < 500;
      updateMemoryDraft(scope, {
        ...(known ? { pending: null } : {}),
        error:
          error instanceof Error
            ? error.message
            : "儲存結果待確認，請核對同一操作。",
        conflict: error instanceof MemoryRequestError && error.status === 409,
      });
    } finally {
      updateMemoryDraft(scope, { busy: false });
    }
  }
  function edit(memory?: CustomerMemory, archive = false) {
    if (state.pending || state.busy) return;
    updateMemoryDraft(scope, {
      editor: {
        action: archive ? "archive" : "save",
        memoryId: memory?.id ?? crypto.randomUUID(),
        expectedRevision: memory?.revision ?? 0,
        category: memory?.category ?? "preference",
        content: memory?.content ?? "",
        reason: "",
      },
      error: "",
      notice: "",
      conflict: false,
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const editor = state.editor;
    if (!editor || !mayEdit || state.busy || state.pending) return;
    const base = {
      commandId: crypto.randomUUID(),
      memoryId: editor.memoryId,
      brandId: page.brandId,
      expectedRevision: editor.expectedRevision,
      reason: editor.reason.trim(),
    };
    void send(
      editor.action === "archive"
        ? { ...base, action: "archive" }
        : {
            ...base,
            action: "save",
            category: editor.category,
            content: editor.content.trim(),
          },
    );
  }
  async function compareLatest() {
    try {
      const latest = await onRefresh();
      const editor = readMemoryDraft(scope).editor;
      if (
        !latest ||
        !editor ||
        latest.brandId !== page.brandId ||
        latest.customerId !== customerId
      )
        return;
      const current = latest.history.find(
        (item) => item.id === editor.memoryId,
      );
      if (!current) return;
      updateMemoryDraft(scope, {
        editor: { ...editor, expectedRevision: current.revision },
        conflict: false,
        notice: "已載入最新記錄，請比對內容後再儲存。",
      });
    } catch {
      updateMemoryDraft(scope, { error: "未能讀取最新記錄，請稍後再試。" });
    }
  }
  async function more() {
    const cursor = olderPage ? olderPage.nextCursor : page.nextCursor;
    if (!cursor || olderPage?.busy) return;
    const stamp = firstStamp;
    setOlder((previous) => ({
      ...previous,
      [scope]: {
        items: previous[scope]?.items ?? [],
        nextCursor: cursor,
        busy: true,
        error: "",
      },
    }));
    try {
      const url =
        endpoint +
        "?" +
        new URLSearchParams({ brandId: page.brandId, before: cursor });
      const next = await readMemoryPage(url, customerId, page.brandId);
      if (firstStamps.current.get(scope) !== stamp) return;
      setOlder((previous) => ({
        ...previous,
        [scope]: {
          items: [...(previous[scope]?.items ?? []), ...next.timeline],
          nextCursor: next.nextCursor,
          busy: false,
          error: "",
        },
      }));
    } catch (error) {
      if (firstStamps.current.get(scope) !== stamp) return;
      setOlder((previous) => ({
        ...previous,
        [scope]: {
          items: previous[scope]?.items ?? [],
          nextCursor: cursor,
          busy: false,
          error: error instanceof Error ? error.message : "未能讀取較早紀錄。",
        },
      }));
    }
  }
  const seen = new Set<string>();
  const timeline = [...page.timeline, ...(olderPage?.items ?? [])].filter(
    (item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    },
  );
  const history = page.history.filter((item) => item.status === "archived");
  return (
    <>
      {state.error && (
        <div className="cm-alert" role="alert">
          <p>{state.error}</p>
          {state.conflict && (
            <button
              type="button"
              disabled={refreshing || state.busy}
              onClick={() => void compareLatest()}
            >
              載入最新記錄
            </button>
          )}
        </div>
      )}
      {state.notice && (
        <p className="cm-notice" role="status">
          {state.notice}
        </p>
      )}
      {state.pending && (
        <div className="cm-alert" role="status">
          <p>
            {state.busy ? "正在核對儲存結果…" : "結果待確認；請核對同一操作。"}
          </p>
          <button
            type="button"
            disabled={state.busy || !mayEdit}
            onClick={() => state.pending && void send(state.pending)}
          >
            {state.busy && (
              <LoaderCircle size={13} className="cm-spin" aria-hidden="true" />
            )}
            核對同一操作
          </button>
        </div>
      )}
      {view === "memory" ? (
        <>
          <div className="cm-section-head">
            <span className="cm-count">{page.memories.length} 項有效記憶</span>
            {mayEdit && !state.editor && (
              <button
                type="button"
                className="cm-add"
                disabled={state.busy || !!state.pending}
                onClick={() => edit()}
              >
                <Plus size={14} aria-hidden="true" />
                新增記憶
              </button>
            )}
          </div>
          {state.editor && mayEdit && (
            <MemoryEditorForm
              editor={state.editor}
              busy={state.busy}
              frozen={!!state.pending}
              onEdit={(patch) =>
                updateMemoryDraft(scope, {
                  editor: { ...state.editor!, ...patch },
                })
              }
              onSubmit={submit}
              onCancel={() =>
                updateMemoryDraft(scope, {
                  editor: null,
                  error: "",
                  notice: "",
                  conflict: false,
                })
              }
            />
          )}
          {!page.memories.length && !state.editor && (
            <div className="cm-empty">
              <NotebookPen size={25} aria-hidden="true" />
              <strong>記低客人想你記住嘅事</strong>
              <p>已核實嘅需要、偏好同注意事項，方便下次接手。</p>
            </div>
          )}
          <div className="cm-cards">
            {page.memories.map((memory) => {
              const revisions = page.history.filter(
                (item) => item.id === memory.id,
              );
              return (
                <article className="cm-card" key={memory.id}>
                  <div className="cm-card-top">
                    <span
                      className="cm-category"
                      data-category={memory.category}
                    >
                      {memoryCategoryNames[memory.category]}
                    </span>
                    {mayEdit && (
                      <div className="cm-card-actions">
                        <button
                          type="button"
                          disabled={
                            state.busy || !!state.pending || !!state.editor
                          }
                          onClick={() => edit(memory)}
                        >
                          <Pencil size={12} aria-hidden="true" />
                          修改
                        </button>
                        <button
                          type="button"
                          disabled={
                            state.busy || !!state.pending || !!state.editor
                          }
                          onClick={() => edit(memory, true)}
                        >
                          <Archive size={12} aria-hidden="true" />
                          封存
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="cm-content">{memory.content}</p>
                  <footer>
                    <span>
                      {memory.source.label}
                      {memory.actorName ? ` · ${memory.actorName}` : ""}
                    </span>
                    <time dateTime={memory.updatedAt}>
                      {memoryTime(memory.updatedAt)}
                    </time>
                  </footer>
                  <details className="cm-provenance">
                    <summary>
                      <History size={12} aria-hidden="true" />
                      依據與修改記錄
                      <ChevronDown size={12} aria-hidden="true" />
                    </summary>
                    <RevisionHistory
                      items={revisions.length ? revisions : [memory]}
                    />
                  </details>
                </article>
              );
            })}
          </div>
          {!!history.length && (
            <details className="cm-archive-history">
              <summary>
                <Archive size={13} aria-hidden="true" />
                封存記錄 · {history.length}
                <ChevronDown size={13} aria-hidden="true" />
              </summary>
              <RevisionHistory items={history} />
            </details>
          )}
          {page.coverage.moreHistory && (
            <p className="cm-muted">
              顯示最近 {page.coverage.historyLimit}{" "}
              項修改；較早紀錄可喺時間線查閱。
            </p>
          )}
        </>
      ) : (
        <MemoryTimeline
          items={timeline}
          hasMore={!!(olderPage ? olderPage.nextCursor : page.nextCursor)}
          busy={!!olderPage?.busy}
          error={olderPage?.error ?? ""}
          onMore={() => void more()}
        />
      )}
    </>
  );
}

export default function CustomerMemoryWorkspace({
  companyId,
  customerId,
  brandId,
  canEdit,
  view,
  active = true,
}: {
  companyId: string;
  customerId: string;
  brandId?: string;
  canEdit: boolean;
  view: "memory" | "timeline";
  active?: boolean;
}) {
  const [brand, setBrand] = useState(brandId ?? "");
  const { mutate: mutateCache } = useSWRConfig();
  const endpoint = `/api/companies/${encodeURIComponent(companyId)}/customers/${encodeURIComponent(customerId)}/memory`;
  const readUrl =
    endpoint + (brand ? "?" + new URLSearchParams({ brandId: brand }) : "");
  const { data, error, isLoading, isValidating } = useSWR<CustomerMemoryPage>(
    active ? readUrl : null,
    (url: string) => readMemoryPage(url, customerId, brand || undefined),
    {
      revalidateOnFocus: true,
      keepPreviousData: false,
      shouldRetryOnError: false,
    },
  );
  const refresh = () => mutateCache<CustomerMemoryPage>(readUrl);
  const denied =
    error instanceof MemoryRequestError && [401, 403].includes(error.status);
  return (
    <section
      className="cm-workspace"
      hidden={!active}
      aria-label="客戶記憶與時間線"
      aria-busy={isLoading}
    >
      <header className="cm-workspace-head">
        <div className="cm-title">
          <span>
            {view === "memory" ? (
              <NotebookPen size={17} aria-hidden="true" />
            ) : (
              <History size={17} aria-hidden="true" />
            )}
          </span>
          <h3>{view === "memory" ? "客戶記憶" : "完整時間線"}</h3>
        </div>
        <button
          type="button"
          className="cm-icon"
          aria-label="重新讀取客戶記憶"
          disabled={isValidating}
          onClick={() => void refresh().catch(() => undefined)}
        >
          {isValidating ? (
            <LoaderCircle className="cm-spin" size={15} aria-hidden="true" />
          ) : (
            <RefreshCw size={15} aria-hidden="true" />
          )}
        </button>
      </header>
      {data && !denied && (
        <div className="cm-scope">
          {data.brands.length > 1 ? (
            <label>
              品牌
              <select
                aria-label="記憶品牌"
                value={brand || data.brandId}
                onChange={(e) => setBrand(e.target.value)}
              >
                {data.brands.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span>
              {data.brands.find((item) => item.id === data.brandId)?.name ??
                "目前品牌"}
            </span>
          )}
          <small>{view === "timeline" ? "香港時間" : "已核實資料"}</small>
        </div>
      )}
      {error && (
        <div className="cm-alert" role="alert">
          <p>{error.message || "暫時未能讀取客戶記憶。"}</p>
          <button
            type="button"
            disabled={isValidating}
            onClick={() => void refresh().catch(() => undefined)}
          >
            重新讀取
          </button>
        </div>
      )}
      {isLoading && (
        <div className="cm-loading" role="status">
          <LoaderCircle size={17} className="cm-spin" aria-hidden="true" />
          正在讀取客戶記憶…
        </div>
      )}
      {data && !denied && (
        <ScopedMemory
          key={companyId + ":" + customerId + ":" + data.brandId}
          companyId={companyId}
          customerId={customerId}
          page={data}
          endpoint={endpoint}
          readUrl={readUrl}
          view={view}
          canEdit={canEdit && !error}
          refreshing={isValidating}
          onRefresh={refresh}
        />
      )}
    </section>
  );
}
