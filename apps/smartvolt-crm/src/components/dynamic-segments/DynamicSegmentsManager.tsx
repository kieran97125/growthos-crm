"use client";
import { useCallback, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  ArrowUpRight,
  Check,
  Filter,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Users,
  X,
} from "lucide-react";
import type {
  DynamicSegment,
  SegmentRule,
  SegmentsPage,
  SegmentPreview,
} from "@/lib/segments/model";
import RuleEditor from "./RuleEditor";
import SegmentCard from "./SegmentCard";
import SegmentMembers from "./SegmentMembers";
import "./dynamic-segments.css";

type Command = Record<string, unknown>;
class SegmentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function read(url: string): Promise<SegmentsPage> {
  const r = await fetch(url, { cache: "no-store" }),
    d = await r.json();
  if (!r.ok) throw new SegmentError(d.error ?? "未能讀取分眾。", r.status);
  return d;
}
async function write<T>(url: string, body: Command): Promise<T> {
  const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    d = await r.json();
  if (!r.ok)
    throw new SegmentError(
      d.error ?? "結果未能確認，請核對同一儲存。",
      r.status,
    );
  return d;
}
function definitionKey(d: Pick<Draft, "id" | "mode" | "rules" | "includePos">) {
  return JSON.stringify([d.id, d.mode, d.rules, d.includePos]);
}
type Draft = {
  open: boolean;
  id: string;
  revision: number;
  name: string;
  mode: "all" | "any";
  rules: SegmentRule[];
  includePos: boolean;
  enabled: boolean;
  dirty: boolean;
  busy: boolean;
  previewing: boolean;
  error: string;
  notice: string;
  pending: Command | null;
  preview: SegmentPreview["preview"] | null;
};
export type DynamicSegmentsManagerProps = {
  companyId: string;
  brands: { id: string; name: string }[];
  canManage: boolean;
  brandId?: string;
};
export default function DynamicSegmentsManager({
  companyId,
  brands,
  canManage,
  brandId,
}: DynamicSegmentsManagerProps) {
  const [localBrand, setLocalBrand] = useState(brands[0]?.id ?? ""),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [focused, setFocused] = useState<Record<string, string>>({}),
    [paging, setPaging] = useState<
      Record<string, { after?: string; before?: string }>
    >({});
  const brand = brandId || localBrand,
    scope = `${companyId}:${brand}`,
    endpoint = `/api/companies/${encodeURIComponent(companyId)}/segments`,
    url = endpoint + "?" + new URLSearchParams({ brandId: brand });
  const { mutate: cacheMutate } = useSWRConfig(),
    { data, error, isLoading, isValidating } = useSWR<SegmentsPage>(
      brand ? url : null,
      read,
      {
        keepPreviousData: false,
        refreshInterval: 30000,
        shouldRetryOnError: false,
      },
    );
  const active = useRef(scope);
  active.current = scope;
  const selectedId = focused[scope] ?? "",
    pageKey = `${scope}:${selectedId}`,
    page = paging[pageKey] ?? {},
    detailUrl = selectedId
      ? endpoint +
        "?" +
        new URLSearchParams({ brandId: brand, segmentId: selectedId, ...page })
      : null;
  const details = useSWR<SegmentsPage>(detailUrl, read, {
      keepPreviousData: false,
      refreshInterval: 30000,
      shouldRetryOnError: false,
    }),
    selected = details.data?.selected,
    draft = drafts[scope],
    stages = data?.stages ?? [];
  const mutate = useCallback(() => cacheMutate(url), [cacheMutate, url]);
  function update(key: string, fn: (old: Draft) => Draft) {
    setDrafts((old) => (old[key] ? { ...old, [key]: fn(old[key]) } : old));
  }
  function edit(segment?: DynamicSegment) {
    setDrafts((old) => ({
      ...old,
      [scope]: {
        open: true,
        id: segment?.id ?? crypto.randomUUID(),
        revision: segment?.revision ?? 0,
        name: segment?.name ?? "",
        mode: segment?.mode ?? "all",
        rules: structuredClone(
          segment?.rules ?? [{ kind: "booking", value: "none" }],
        ),
        includePos: segment?.includePos ?? false,
        enabled: segment?.enabled ?? true,
        dirty: false,
        busy: false,
        previewing: false,
        error: "",
        notice: "",
        pending: null,
        preview: null,
      },
    }));
  }
  function change(patch: Partial<Draft>) {
    update(scope, (d) => ({
      ...d,
      ...patch,
      dirty: true,
      preview: null,
      error: "",
      notice: "",
    }));
  }
  async function preview() {
    if (!draft || draft.busy || draft.previewing) return;
    const started = scope,
      fingerprint = definitionKey(draft);
    update(started, (d) => ({ ...d, previewing: true, error: "" }));
    try {
      const r = await write<SegmentPreview>(endpoint, {
        action: "preview",
        brandId: brand,
        mode: draft.mode,
        rules: draft.rules,
        includePos: draft.includePos,
      });
      update(started, (d) => ({
        ...d,
        preview: definitionKey(d) === fingerprint ? r.preview : null,
        previewing: false,
      }));
    } catch (e) {
      update(started, (d) => ({
        ...d,
        previewing: false,
        error:
          definitionKey(d) === fingerprint
            ? e instanceof Error
              ? e.message
              : "未能預覽客群。"
            : "",
      }));
    }
  }
  async function save() {
    if (!draft || draft.busy) return;
    const started = scope,
      startedUrl = url,
      command = draft.pending ?? {
        action: "upsert",
        commandId: crypto.randomUUID(),
        id: draft.id,
        brandId: brand,
        name: draft.name,
        mode: draft.mode,
        rules: draft.rules,
        includePos: draft.includePos,
        enabled: draft.enabled,
        revision: draft.revision,
      };
    update(started, (d) => ({
      ...d,
      busy: true,
      pending: command,
      error: "",
      notice: "",
    }));
    try {
      const r = await write<{
        saved: true;
        id: string;
        revision: number;
        count: number;
      }>(endpoint, command);
      update(started, (d) => ({
        ...d,
        busy: false,
        pending: null,
        revision: r.revision,
        dirty: false,
        notice: `已儲存，目前 ${r.count} 位客人符合條件。`,
      }));
      await cacheMutate(startedUrl);
      if (active.current === started)
        setFocused((old) => ({ ...old, [started]: r.id }));
      window.dispatchEvent(new Event("convelta:data-changed"));
    } catch (e) {
      update(started, (d) => ({
        ...d,
        busy: false,
        pending: e instanceof SegmentError && e.status < 500 ? null : command,
        error:
          e instanceof Error ? e.message : "結果未能確認，請核對同一儲存。",
      }));
    }
  }
  const writable = canManage && data?.canManage;
  return (
    <section
      className="ds-work"
      aria-label="自動分眾"
      aria-busy={isLoading || isValidating}
    >
      <header className="ds-head">
        <div>
          <span className="ds-symbol">
            <Filter size={18} />
          </span>
          <div>
            <h2>自動分眾</h2>
            <p>客人符合條件就加入，情況改變就退出。</p>
          </div>
        </div>
        <div className="ds-actions">
          {writable && (
            <button
              type="button"
              className="ds-primary"
              disabled={!!draft?.open}
              onClick={() =>
                draft ? update(scope, (d) => ({ ...d, open: true })) : edit()
              }
            >
              <Plus size={16} />
              {draft ? "繼續編輯" : "新增分眾"}
            </button>
          )}
          <button
            type="button"
            className="ds-icon"
            aria-label="重新讀取分眾"
            onClick={() => void mutate().catch(() => undefined)}
          >
            <RefreshCw size={16} className={isValidating ? "ds-spin" : ""} />
          </button>
        </div>
      </header>
      {!brandId && (
        <label className="ds-brand">
          分眾品牌
          <select
            aria-label="分眾品牌"
            value={brand}
            onChange={(e) => setLocalBrand(e.target.value)}
          >
            {brands.map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p className="ds-error" role="alert">
          {error.message}
        </p>
      )}
      {data?.refreshPending && (
        <p className="ds-muted" role="status">
          名單更新中，暫時顯示上次結果。發送前會再核對目前資格。
        </p>
      )}
      {isLoading && (
        <p className="ds-muted" role="status">
          正在讀取分眾…
        </p>
      )}
      {data && !data.segments.length && !draft?.open && (
        <div className="ds-empty">
          <Users size={26} />
          <strong>留意同一類需要嘅客人</strong>
          <p>例如問過未預約，或者一段時間未再查詢。</p>
          {writable && (
            <button type="button" onClick={() => edit()}>
              建立第一個分眾
              <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      )}
      {!!data?.segments.length && (
        <div className="ds-list">
          {data.segments.map((s) => (
            <SegmentCard
              key={s.id}
              segment={s}
              refreshPending={!!data.refreshPending}
              selected={selectedId === s.id}
              stages={stages}
              canManage={!!writable}
              editing={!!draft?.open}
              onSelect={() =>
                setFocused((old) => ({
                  ...old,
                  [scope]: selectedId === s.id ? "" : s.id,
                }))
              }
              onEdit={() => edit(s)}
            />
          ))}
        </div>
      )}
      {draft?.open && (
        <div className="ds-editor" role="region" aria-label="分眾編輯">
          <header>
            <div>
              <h3>{draft.revision ? "編輯分眾" : "新增分眾"}</h3>
              <p>條件會持續檢查，毋須人手加減名單。</p>
            </div>
            <button
              type="button"
              className="ds-icon"
              aria-label="收起分眾草稿"
              disabled={draft.busy}
              onClick={() => update(scope, (d) => ({ ...d, open: false }))}
            >
              <X size={18} />
            </button>
          </header>
          <fieldset disabled={!writable || draft.busy || !!draft.pending}>
            <label>
              分眾名稱
              <input
                aria-label="分眾名稱"
                maxLength={100}
                value={draft.name}
                placeholder="例如：問過未預約"
                onChange={(e) => change({ name: e.target.value })}
              />
            </label>
            <label>
              符合條件
              <select
                aria-label="符合條件"
                value={draft.mode}
                onChange={(e) =>
                  change({ mode: e.target.value as Draft["mode"] })
                }
              >
                <option value="all">全部符合</option>
                <option value="any">符合其中一項</option>
              </select>
            </label>
            <div className="ds-rules">
              {draft.rules.map((rule, index) => (
                <RuleEditor
                  key={index}
                  rule={rule}
                  index={index}
                  stages={stages}
                  includePos={draft.includePos}
                  canRemove={draft.rules.length > 1}
                  onChange={(r) =>
                    change({
                      rules: draft.rules.map((old, i) =>
                        i === index ? r : old,
                      ),
                    })
                  }
                  onRemove={() =>
                    change({ rules: draft.rules.filter((_, i) => i !== index) })
                  }
                />
              ))}
            </div>
            <button
              type="button"
              className="ds-text"
              disabled={draft.rules.length >= 10}
              onClick={() =>
                change({ rules: [...draft.rules, { kind: "tag", value: "" }] })
              }
            >
              <Plus size={15} />
              新增條件
            </button>
            {data?.hasPos && (
              <label className="ds-check">
                <input
                  type="checkbox"
                  checked={draft.includePos}
                  onChange={(e) =>
                    change({
                      includePos: e.target.checked,
                      rules: e.target.checked
                        ? draft.rules
                        : draft.rules.filter(
                              (r) => r.kind !== "visit" && r.kind !== "payment",
                            ).length
                          ? draft.rules.filter(
                              (r) => r.kind !== "visit" && r.kind !== "payment",
                            )
                          : [{ kind: "booking", value: "none" }],
                    })
                  }
                />
                包括 POS 到店及付款資料
              </label>
            )}
            <label className="ds-check">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => change({ enabled: e.target.checked })}
              />
              啟用自動更新
            </label>
          </fieldset>
          {draft.error && (
            <p className="ds-error" role="alert">
              {draft.error}
            </p>
          )}
          {draft.notice && (
            <p className="ds-notice" role="status">
              <Check size={15} />
              {draft.notice}
            </p>
          )}
          {draft.preview && (
            <div className="ds-preview" aria-label="分眾預覽" role="status">
              <strong>{draft.preview.total} 位客人符合條件</strong>
              {!!draft.preview.sample.length && (
                <p>{draft.preview.sample.map((c) => c.name).join("、")}</p>
              )}
              <small>預覽唔會發送訊息；發送前仍會核對同意及渠道資格。</small>
            </div>
          )}
          <footer>
            <button
              type="button"
              disabled={draft.busy || draft.previewing || !!draft.pending}
              onClick={() => void preview()}
            >
              {draft.previewing ? (
                <LoaderCircle size={16} className="ds-spin" />
              ) : (
                <Users size={16} />
              )}
              預覽客群
            </button>
            <div>
              <button
                type="button"
                className="ds-text"
                disabled={draft.busy || !!draft.pending}
                onClick={() =>
                  setDrafts((old) => {
                    const next = { ...old };
                    delete next[scope];
                    return next;
                  })
                }
              >
                放棄草稿
              </button>
              <button
                type="button"
                className="ds-primary"
                disabled={
                  !writable ||
                  draft.busy ||
                  (!draft.pending &&
                    (!draft.name.trim() ||
                      draft.rules.some((r) => "value" in r && !r.value.trim())))
                }
                onClick={() => void save()}
              >
                {draft.busy ? (
                  <LoaderCircle size={16} className="ds-spin" />
                ) : (
                  <Save size={16} />
                )}{" "}
                {draft.pending ? "核對同一儲存" : "儲存分眾"}
              </button>
            </div>
          </footer>
        </div>
      )}
      {selectedId && (
        <SegmentMembers
          selected={selected}
          refreshPending={!!details.data?.refreshPending}
          error={details.error}
          page={page}
          onClose={() => setFocused((old) => ({ ...old, [scope]: "" }))}
          onPage={(patch) =>
            setPaging((old) => ({ ...old, [pageKey]: { ...page, ...patch } }))
          }
        />
      )}
    </section>
  );
}
