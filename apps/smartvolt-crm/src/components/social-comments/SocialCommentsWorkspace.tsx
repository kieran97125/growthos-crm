"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePause,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import type {
  SocialCommentsPage,
  SocialRule,
  SocialRuleDraft,
  SocialCommentDelivery,
} from "@/lib/social-comments/model";
import {
  commentMatches,
  socialRuleDefinition,
} from "@/lib/social-comments/model";
import { useRecordedCommand } from "@/components/engagement/useRecordedCommand";
import SocialPostPicker from "./SocialPostPicker";

class SocialReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function read(url: string): Promise<SocialCommentsPage> {
  const response = await fetch(url, { cache: "no-store" }),
    data = await response.json();
  if (!response.ok)
    throw new SocialReadError(
      data.error ?? "未能讀取留言私訊。",
      response.status,
    );
  return data;
}
const states: Record<SocialCommentDelivery["state"], string> = {
  queued: "待處理",
  checking: "核對資格",
  sending: "正提交平台",
  accepted: "平台已接收",
  failed: "未能發送",
  uncertain: "結果待核對",
  skipped: "已停止",
};
const reasons: Record<string, string> = {
  comment_deleted: "留言已刪除",
  comment_changed: "留言已改動",
  provider_source_changed: "留言資格已改變",
  comment_expired: "留言已超出時限",
  rule_paused: "規則已暫停",
  rule_changed: "規則已更新",
  authority_changed: "管理權限已改變",
  connection_disabled: "渠道已停用",
  connection_not_ready: "渠道尚未準備好",
  automations_paused: "公司自動處理已暫停",
  rate_limit: "稍後繼續處理",
  token_expired: "需要重新接駁渠道",
  comment_permission_missing: "缺少留言私訊權限",
  permission_missing: "平台未授權",
  provider_rejected: "平台拒絕，請核對渠道紀錄",
  activity_already_replied: "此留言已在平台回覆",
  private_reply_unavailable: "此留言未能接收私訊",
  provider_unreachable: "未能連接平台",
  worker_interrupted: "提交結果未能確認",
  provider_response_invalid: "平台回覆未能確認",
  source_check_pending: "未能完成資格核對",
  post_not_owned_or_unsupported: "貼文不可用",
  page_token_mismatch: "渠道帳戶未通過核實",
  comment_identity_mismatch: "留言來源未通過核實",
  token_app_mismatch: "渠道憑證未通過核實",
};
const dateFormatter = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function shortDate(value: string) {
  return dateFormatter.format(new Date(value));
}
function uniqueDeliveries(rows: SocialCommentDelivery[]) {
  const unique = new Map<string, SocialCommentDelivery>();
  for (const row of rows) if (!unique.has(row.id)) unique.set(row.id, row);
  return [...unique.values()];
}
type Draft = SocialRuleDraft & {
  keywordsText: string;
  test: string;
  scopeStamp: string;
};
function draftFrom(rule: SocialRule, scopeStamp: string): Draft {
  return {
    id: rule.id,
    revision: rule.revision,
    connectionId: rule.connectionId,
    brandId: rule.brandId,
    name: rule.name,
    postId: rule.postId,
    keywords: rule.keywords,
    keywordsText: rule.keywords.join("\n"),
    match: rule.match,
    body: rule.body,
    enabled: rule.enabled,
    test: "",
    scopeStamp,
  };
}

export default function SocialCommentsWorkspace(props: {
  companyId: string;
  initial?: SocialCommentsPage;
}) {
  return <SocialCommentsWorkspaceInner key={props.companyId} {...props} />;
}
function SocialCommentsWorkspaceInner({
  companyId,
  initial,
}: {
  companyId: string;
  initial?: SocialCommentsPage;
}) {
  const endpoint = `/api/companies/${encodeURIComponent(companyId)}/social-comments`,
    [brand, setBrand] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null),
    [older, setOlder] = useState<SocialCommentDelivery[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [olderScope, setOlderScope] = useState(""),
    [moreBusy, setMoreBusy] = useState(false),
    [pageError, setPageError] = useState(""),
    currentScope = useRef(brand),
    scopeGeneration = useRef(0),
    paging = useRef(false),
    { data, error, isLoading, isValidating, mutate } =
      useSWR<SocialCommentsPage>(
        endpoint + (brand ? `?${new URLSearchParams({ brandId: brand })}` : ""),
        read,
        {
          fallbackData: brand ? undefined : initial,
          refreshInterval: 20000,
          keepPreviousData: false,
        },
      ),
    command = useRecordedCommand(endpoint, async () => {
      await mutate();
    });
  const denied =
      error instanceof SocialReadError && [401, 403].includes(error.status),
    visible = denied ? undefined : data,
    locked = command.frozen || !!error,
    canManage = (visible?.canManage ?? false) && !error,
    allowedBrands = new Set(visible?.brands.map((b) => b.id) ?? []),
    scopeStamp =
      visible?.scopeStamp ??
      JSON.stringify([
        companyId,
        [...allowedBrands].sort(),
        visible?.canManage,
      ]),
    draftAllowed =
      !!draft &&
      !!visible?.canManage &&
      draft.scopeStamp === scopeStamp &&
      allowedBrands.has(draft.brandId) &&
      (!draft.connectionId ||
        !!visible?.connections.some(
          (c) => c.id === draft.connectionId && c.brandId === draft.brandId,
        )),
    keywords =
      draft?.keywordsText
        .split(/[\n,，]+/u)
        .map((s) => s.trim())
        .filter(Boolean) ?? [],
    definition = draft
      ? {
          id: draft.id,
          revision: draft.revision,
          connectionId: draft.connectionId,
          brandId: draft.brandId,
          name: draft.name,
          postId: draft.postId,
          keywords,
          match: draft.match,
          body: draft.body,
          enabled: draft.enabled,
        }
      : null,
    valid = definition
      ? socialRuleDefinition.safeParse(definition).success
      : false,
    activeConnection = visible?.connections.find(
      (c) => c.id === draft?.connectionId,
    ),
    history = denied
      ? []
      : uniqueDeliveries([
          ...(visible?.deliveries ?? []),
          ...(olderScope === scopeStamp ? older : []),
        ]).filter((row) => allowedBrands.has(row.brandId)),
    nextCursor = denied
      ? null
      : olderScope === scopeStamp
        ? (cursor ?? visible?.nextCursor ?? null)
        : (visible?.nextCursor ?? null);
  function create() {
    const connection = visible?.connections.find(
        (c) => c.enabled && (!brand || c.brandId === brand),
      ),
      selectedBrand =
        brand || connection?.brandId || visible?.brands[0]?.id || "";
    setDraft({
      id: crypto.randomUUID(),
      revision: 0,
      brandId: selectedBrand,
      connectionId: connection?.id ?? "",
      name: "",
      postId: "",
      keywords: [],
      keywordsText: "",
      match: "any",
      body: "",
      enabled: false,
      test: "",
      scopeStamp,
    });
    setPageError("");
  }
  function patch(next: Partial<Draft>) {
    if (!locked) setDraft((d) => d && { ...d, ...next });
  }
  async function save() {
    if (!valid || !definition || locked) return;
    const saved = await command.send({
      action: "save",
      commandId: crypto.randomUUID(),
      definition,
    });
    if (saved) setDraft(null);
    else await mutate().catch(() => undefined);
  }
  async function toggle(rule: SocialRule) {
    if (locked) return;
    const saved = await command.send({
      action: "toggle",
      commandId: crypto.randomUUID(),
      id: rule.id,
      revision: rule.revision,
      enabled: !rule.enabled,
    });
    if (!saved) await mutate().catch(() => undefined);
  }
  async function more() {
    if (!nextCursor || paging.current) return;
    paging.current = true;
    setMoreBusy(true);
    setPageError("");
    const expected = brand;
    const expectedScope = scopeStamp;
    const generation = scopeGeneration.current;
    try {
      const page = await read(
        endpoint +
          "?" +
          new URLSearchParams({
            ...(brand ? { brandId: brand } : {}),
            before: nextCursor,
          }),
      );
      if (page.scopeStamp && page.scopeStamp !== expectedScope) {
        await mutate().catch(() => undefined);
        return;
      }
      if (
        currentScope.current === expected &&
        scopeGeneration.current === generation
      ) {
        setOlder((rows) => [
          ...(olderScope === expectedScope ? rows : []),
          ...page.deliveries,
        ]);
        setOlderScope(expectedScope);
        setCursor(page.nextCursor ?? "");
      }
    } catch (e) {
      if (e instanceof SocialReadError && [401, 403].includes(e.status))
        await mutate().catch(() => undefined);
      if (
        currentScope.current === expected &&
        scopeGeneration.current === generation
      )
        setPageError(e instanceof Error ? e.message : "未能讀取較早紀錄。");
    } finally {
      paging.current = false;
      setMoreBusy(false);
    }
  }
  return (
    <main className="sc-work">
      <Link className="sc-back" href={`/company/${companyId}/settings`}>
        <ArrowLeft size={15} /> 團隊與設定
      </Link>
      <header className="sc-heading">
        <div>
          <span className="sc-eyebrow">社交引流</span>
          <h1>
            由留言，開始對話<span className="sc-dot">。</span>
          </h1>
          <p>留低關鍵字，將查詢交到客服手上。</p>
        </div>
        <div className="sc-toolbar">
          <button
            className="sc-icon"
            aria-label="重新讀取留言規則"
            disabled={isValidating}
            onClick={() => void mutate()}
          >
            <RefreshCw size={17} className={isValidating ? "sc-spin" : ""} />
          </button>
          {canManage && (
            <button
              className="sc-primary"
              disabled={!!draft || locked}
              onClick={create}
            >
              <Plus size={17} />
              新增規則
            </button>
          )}
        </div>
      </header>
      {error && (
        <div role="alert" className="sc-error">
          {error.message}
          {!denied && visible && (
            <span> 未能刷新，以下係上次讀取嘅紀錄；操作已暫停。</span>
          )}
          <button onClick={() => void mutate()}>重新讀取</button>
        </div>
      )}
      {(command.error || pageError) && (
        <div role="alert" className="sc-error">
          {command.error || pageError}
          {command.frozen && !denied && (
            <button
              disabled={command.busy}
              onClick={() => void command.retry()}
            >
              核對同一儲存
            </button>
          )}
        </div>
      )}
      {command.notice && (
        <p role="status" className="sc-notice">
          <Check size={15} />
          {command.notice}
        </p>
      )}
      {visible?.automationsPaused && (
        <p className="sc-warning">
          <CirclePause size={17} />
          公司自動處理已暫停，現有規則會保留。
        </p>
      )}
      {draft && !draftAllowed && !denied && visible && (
        <div className="sc-warning" role="status">
          草稿暫時無法編輯，請核對目前權限。
          <button disabled={command.frozen} onClick={() => setDraft(null)}>
            放棄本機草稿
          </button>
        </div>
      )}
      <div className="sc-filter">
        <label htmlFor="sc-brand">品牌</label>
        <select
          id="sc-brand"
          value={brand}
          disabled={!!draft || locked}
          onChange={(e) => {
            currentScope.current = e.target.value;
            scopeGeneration.current++;
            setBrand(e.target.value);
            setOlder([]);
            setOlderScope("");
            setCursor(null);
            setPageError("");
          }}
        >
          <option value="">全部品牌</option>
          {visible?.brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <span>香港時間 · 自動更新</span>
      </div>
      {isLoading && !visible ? (
        <div className="sc-loading" role="status">
          <LoaderCircle className="sc-spin" size={20} />
          正在讀取留言規則…
        </div>
      ) : (
        <>
          {draft && draftAllowed && !denied && (
            <section className="sc-editor" aria-label="留言私訊規則編輯">
              <div className="sc-editor-head">
                <div>
                  <span className="sc-step">規則設定</span>
                  <h2>{draft.revision ? "編輯留言規則" : "新增留言規則"}</h2>
                </div>
                <button
                  className="sc-icon"
                  aria-label="關閉留言草稿"
                  disabled={locked}
                  onClick={() => setDraft(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="sc-editor-grid">
                <div className="sc-fields">
                  <label>
                    規則名稱
                    <input
                      value={draft.name}
                      maxLength={100}
                      disabled={locked}
                      placeholder="例如：輕腿療程查詢"
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </label>
                  <label>
                    渠道帳戶
                    <select
                      value={draft.connectionId}
                      disabled={!!draft.revision || locked}
                      onChange={(e) => {
                        const connection = visible?.connections.find(
                          (c) => c.id === e.target.value,
                        );
                        patch({
                          connectionId: e.target.value,
                          brandId: connection?.brandId ?? draft.brandId,
                          postId: "",
                        });
                      }}
                    >
                      <option value="">選擇帳戶</option>
                      {visible?.connections
                        .filter((c) => !brand || c.brandId === brand)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.channel === "instagram"
                              ? "Instagram"
                              : "Facebook"}{" "}
                            · {c.label}
                            {!c.enabled ? "（已停用）" : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  {!visible?.connections.length && (
                    <p className="sc-warning">
                      先連接 Facebook 或 Instagram，便可設定貼文規則。
                      <Link href={`/company/${companyId}/crm/meta`}>
                        前往渠道設定
                        <ArrowUpRight size={14} />
                      </Link>
                    </p>
                  )}
                  <SocialPostPicker
                    key={draft.connectionId}
                    endpoint={endpoint}
                    connectionId={draft.connectionId}
                    channel={activeConnection?.channel}
                    value={draft.postId}
                    fixed={!!draft.revision}
                    disabled={locked}
                    onChange={(postId) => patch({ postId })}
                  />
                  <label>
                    觸發關鍵字
                    <textarea
                      value={draft.keywordsText}
                      disabled={locked}
                      rows={3}
                      maxLength={1700}
                      placeholder={"價錢\n想了解"}
                      onChange={(e) => patch({ keywordsText: e.target.value })}
                    />
                    <small>每行一個，最多 20 個。</small>
                  </label>
                  <label>
                    符合方式
                    <select
                      value={draft.match}
                      disabled={locked}
                      onChange={(e) =>
                        patch({ match: e.target.value as "any" | "all" })
                      }
                    >
                      <option value="any">包含其中一個關鍵字</option>
                      <option value="all">包含全部關鍵字</option>
                    </select>
                  </label>
                  <label>
                    私訊內容
                    <textarea
                      value={draft.body}
                      disabled={locked}
                      rows={4}
                      maxLength={1000}
                      placeholder="你好，收到你嘅留言。想了解邊方面多啲？"
                      onChange={(e) => patch({ body: e.target.value })}
                    />
                    <span className="sc-count">{draft.body.length} / 1000</span>
                  </label>
                </div>
                <aside className="sc-preview">
                  <div className="sc-preview-title">
                    <Sparkles size={16} />
                    睇下點樣觸發
                  </div>
                  <label>
                    試一句留言
                    <input
                      value={draft.test}
                      maxLength={2000}
                      disabled={locked}
                      placeholder="請問價錢係幾多？"
                      onChange={(e) => patch({ test: e.target.value })}
                    />
                  </label>
                  {draft.test && (
                    <div
                      className={`sc-match ${commentMatches(draft.test, keywords, draft.match) ? "sc-match-yes" : ""}`}
                    >
                      {commentMatches(draft.test, keywords, draft.match) ? (
                        <>
                          <Check size={15} />
                          符合規則
                        </>
                      ) : (
                        "未符合關鍵字"
                      )}
                    </div>
                  )}
                  <div className="sc-phone">
                    <div className="sc-phone-top">
                      <span className="sc-avatar">
                        <MessageCircle size={16} />
                      </span>
                      <span>{activeConnection?.label || "你嘅品牌"}</span>
                    </div>
                    <div className="sc-message">
                      {draft.body.trim() || "你寫好嘅私訊會出現喺呢度。"}
                    </div>
                    <p>客人回覆後，由收件匣接續對話。</p>
                  </div>
                  <p className="sc-caption">本機預覽，唔會發出訊息。</p>
                </aside>
              </div>
              <footer className="sc-editor-footer">
                <label className="sc-enable">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    disabled={locked}
                    onChange={(e) => patch({ enabled: e.target.checked })}
                  />
                  <span>
                    啟用此規則<small>只處理之後嘅新留言。</small>
                  </span>
                </label>
                <div>
                  <button disabled={locked} onClick={() => setDraft(null)}>
                    放棄草稿
                  </button>
                  <button
                    className="sc-primary"
                    disabled={!valid || command.busy || locked}
                    onClick={() => void save()}
                  >
                    {command.busy ? (
                      <LoaderCircle className="sc-spin" size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    {draft.enabled ? "核實並啟用" : "儲存草稿"}
                  </button>
                </div>
              </footer>
            </section>
          )}
          <section className="sc-rules" aria-label="留言規則">
            <div className="sc-section-title">
              <h2>留言規則</h2>
              <span>{visible?.rules.length ?? 0} 個</span>
            </div>
            {visible?.rules.length ? (
              <div className="sc-rule-grid">
                {visible.rules.map((rule) => (
                  <article className="sc-rule" key={rule.id}>
                    <header>
                      <span className={`sc-channel sc-${rule.channel}`}>
                        {rule.channel === "instagram"
                          ? "Instagram"
                          : "Facebook"}
                      </span>
                      <span
                        className={`sc-state ${rule.enabled ? "sc-state-active" : ""}`}
                      >
                        {rule.enabled ? "已啟用" : "已暫停"}
                      </span>
                    </header>
                    <h3>{rule.name}</h3>
                    <p className="sc-rule-keywords">
                      {rule.match === "all" ? "全部符合" : "其中一個"}{" "}
                      <ChevronRight size={13} />
                      {rule.keywords.join(" · ")}
                    </p>
                    <p className="sc-rule-body">{rule.body}</p>
                    <footer>
                      {rule.permalink ? (
                        <a
                          href={rule.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          查看貼文
                          <ExternalLink size={13} />
                        </a>
                      ) : (
                        <span className="sc-muted">貼文 {rule.postId}</span>
                      )}
                      <div>
                        {canManage && (
                          <>
                            <button
                              className="sc-icon"
                              aria-label={`編輯 ${rule.name}`}
                              disabled={locked || !!draft}
                              onClick={() => {
                                setDraft(draftFrom(rule, scopeStamp));
                                setPageError("");
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              disabled={
                                command.busy || command.frozen || !!draft
                              }
                              onClick={() => void toggle(rule)}
                            >
                              {rule.enabled ? (
                                <CirclePause size={14} />
                              ) : (
                                <Play size={14} />
                              )}
                              {rule.enabled ? "暫停" : "啟用"}
                            </button>
                          </>
                        )}
                      </div>
                    </footer>
                  </article>
                ))}
              </div>
            ) : (
              <div className="sc-empty">
                <div className="sc-empty-symbol">
                  <MessageCircle size={30} />
                </div>
                <h3>下一段對話，由一句留言開始</h3>
                <p>揀一篇貼文，寫好第一句私訊。</p>
                {canManage && !draft && (
                  <button className="sc-primary" onClick={create}>
                    <Plus size={16} />
                    建立第一個規則
                  </button>
                )}
              </div>
            )}
          </section>
          <section className="sc-history" aria-label="留言私訊結果">
            <div className="sc-section-title">
              <h2>最近結果</h2>
              <span>每次處理都有紀錄</span>
            </div>
            {history.length ? (
              <div className="sc-history-list">
                {history.map((job) => (
                  <article key={job.id} className="sc-history-row">
                    <div className={`sc-result-icon sc-result-${job.state}`}>
                      <MessageCircle size={17} />
                    </div>
                    <div className="sc-history-content">
                      <header>
                        <strong>{job.ruleName}</strong>
                        <time dateTime={job.createdAt}>
                          {shortDate(job.createdAt)}
                        </time>
                      </header>
                      <p className="sc-comment-quote">「{job.comment}」</p>
                      <div className="sc-history-meta">
                        <span className={`sc-state sc-state-${job.state}`}>
                          {states[job.state]}
                        </span>
                        {job.reason && (
                          <span>{reasons[job.reason] ?? "請核對渠道狀態"}</span>
                        )}
                        {job.permalink && (
                          <a
                            href={job.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            原貼文
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      {job.state === "uncertain" && (
                        <p className="sc-warning">
                          暫停重發，請先核對平台紀錄。
                        </p>
                      )}
                      {job.canRetry && canManage && (
                        <button
                          disabled={locked || command.busy}
                          onClick={() =>
                            void command.send({
                              action: "retry",
                              commandId: crypto.randomUUID(),
                              id: job.id,
                            })
                          }
                        >
                          <RefreshCw size={13} />
                          重新核對並再試
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="sc-history-empty">
                新留言觸發後，處理結果會顯示喺呢度。
              </p>
            )}
            {!!nextCursor && (
              <button
                className="sc-more"
                disabled={moreBusy}
                onClick={() => void more()}
              >
                {moreBusy ? (
                  <LoaderCircle className="sc-spin" size={15} />
                ) : (
                  <ChevronDown size={15} />
                )}
                較早紀錄
              </button>
            )}
          </section>
          <details className="sc-policy">
            <summary>平台資格與發送範圍</summary>
            <p>
              每位客人喺同一貼文只處理一次，並只回覆七日內嘅有效留言。客人回覆私訊後，才可按渠道服務時限繼續對話；留言本身唔代表同意日後推播。Live
              留言不適用此規則。
            </p>
            <p>
              Facebook／Instagram 需正式留言及私訊權限、正確 Webhook
              訂閱及帳戶授權。平台已接收，仍唔等於客人已讀。貼文或關鍵字修改、撤權及停用會阻止待處理發送。
            </p>
          </details>
        </>
      )}
    </main>
  );
}
