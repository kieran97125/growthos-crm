"use client";
import { useContext, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  Globe2,
  Loader2,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import { WebsiteImportCommitContext } from "@/lib/saas/CompanyProvider";
import {
  WEBSITE_LIMITS,
  categoryLabels,
  websiteJobSchema,
  type WebsiteJob,
} from "@/lib/website/model";
import "./website-import.css";

export default function WebsiteKnowledgeImport({
  companyId,
  brandId,
  connected,
}: {
  companyId: string;
  brandId: string;
  connected: boolean;
}) {
  const commit = useContext(WebsiteImportCommitContext);
  const [url, setUrl] = useState(""),
    [job, setJob] = useState<WebsiteJob | null>(null),
    [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [importing, setImporting] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const live = useRef(true),
    stop = useRef(false),
    initialRead = useRef<AbortController | null>(null),
    requestController = useRef<AbortController | null>(null);
  const endpoint = `/api/companies/${companyId}/knowledge/website`;
  function adopt(next: WebsiteJob | null) {
    setJob(next);
    if (next) setSelected(next.state.candidates.map((a) => a.id));
  }
  useEffect(() => {
    live.current = true;
    if (!connected) return;
    const controller = new AbortController();
    initialRead.current = controller;
    void fetch(`${endpoint}?brand=${encodeURIComponent(brandId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw Error(body.error ?? "暫時未能讀取掃描進度。");
        if (live.current) {
          const next = body.job ? websiteJobSchema.parse(body.job) : null;
          adopt(next);
          if (next) setUrl(next.state.inputUrl);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted && live.current)
          setError(e instanceof Error ? e.message : "暫時未能讀取進度。");
      });
    return () => {
      live.current = false;
      stop.current = true;
      controller.abort();
      requestController.current?.abort();
    };
  }, [connected, endpoint, brandId]);
  async function post(body: object) {
    requestController.current = new AbortController();
    const r = await fetch(endpoint, {
      method: "POST",
      signal: requestController.current.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error ?? "網站掃描未完成。");
    return websiteJobSchema.parse(data.job);
  }
  async function scan(resume = false) {
    if (busy) return;
    initialRead.current?.abort();
    setBusy(true);
    setError("");
    setNotice("");
    stop.current = false;
    try {
      let current =
        resume && job
          ? job
          : await post({
              kind: "start",
              id: crypto.randomUUID(),
              brandId,
              url,
            });
      if (live.current) adopt(current);
      while (
        live.current &&
        !stop.current &&
        ["queued", "running"].includes(current.status)
      ) {
        if (current.status === "running") {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (stop.current || !live.current) break;
        }
        current = await post({
          kind: "step",
          id: current.id,
          token: crypto.randomUUID(),
        });
        if (live.current) adopt(current);
      }
    } catch (e) {
      if (live.current)
        setError(
          e instanceof Error && e.name !== "AbortError"
            ? e.message
            : "掃描已暫停，稍後可以接續。",
        );
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function importDrafts() {
    if (!job || !commit || !selected.length || importing) return;
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const result = await commit({ id: job.id, selected });
      if (live.current) {
        setJob({
          ...job,
          status: "imported",
          added: result.added,
          skipped: result.skipped,
        });
        setNotice(
          `已加入 ${result.added} 項草稿${result.skipped ? `，略過 ${result.skipped} 項相同內容` : ""}。核准後可供 C 引用。`,
        );
      }
    } catch (e) {
      if (live.current)
        setError(
          e instanceof Error ? e.message : "未能確認匯入結果，請重試儲存。",
        );
    } finally {
      if (live.current) setImporting(false);
    }
  }
  const ready = job?.status === "ready",
    pending = job && ["queued", "running"].includes(job.status);
  const homepage = job?.state.pages[0];
  return (
    <section className="wi-card" aria-label="由網站匯入品牌資料">
      <button
        className="wi-heading"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="wi-globe">
          <Globe2 size={21} />
        </span>
        <span>
          <strong>讓網站成為品牌知識</strong>
          <small>掃描、檢視，再交畀 C。</small>
        </span>
        <span className="wi-heading-action">
          由網站匯入{" "}
          <ChevronDown size={15} className={open ? "wi-rotated" : ""} />
        </span>
      </button>
      {open && (
        <div className="wi-body">
          <form
            className="wi-url"
            onSubmit={(e) => {
              e.preventDefault();
              void scan();
            }}
          >
            <label>
              <Globe2 size={16} />
              <span className="wi-sr">品牌網站網址</span>
              <input
                aria-label="品牌網站網址"
                placeholder="https://your-brand.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={2048}
                disabled={busy || importing || !connected}
              />
            </label>
            <button
              className="st-button st-primary"
              disabled={!url.trim() || busy || importing || !connected}
              type="submit"
            >
              {busy ? (
                <Loader2 size={15} className="wi-spin" />
              ) : (
                <ScanLine size={15} />
              )}
              {busy ? "掃描中" : job ? "重新掃描" : "掃描網站"}
            </button>
          </form>
          {!connected && (
            <p className="wi-muted">登入公司後，可掃描公開品牌網站。</p>
          )}
          {error && (
            <p className="wi-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="wi-success" role="status">
              <Check size={16} />
              {notice}
            </p>
          )}
          {job && (
            <>
              <div className="wi-progress" aria-live="polite">
                <span>
                  {busy
                    ? "正在整理網站"
                    : job.status === "imported"
                      ? "已匯入草稿"
                      : job.status === "failed"
                        ? "未能讀取網站"
                        : ready
                          ? "準備好供你檢視"
                          : "掃描已保留"}
                </span>
                <b>{job.state.pages.length} 頁</b>
              </div>
              {busy && (
                <div className="wi-track">
                  <i
                    style={{
                      width: `${Math.max(8, (job.state.visited.length / WEBSITE_LIMITS.pages) * 100)}%`,
                    }}
                  />
                </div>
              )}
              {pending && !busy && (
                <button className="st-button" onClick={() => void scan(true)}>
                  <RefreshCw size={14} />
                  繼續掃描
                </button>
              )}
              {busy && (
                <button
                  className="wi-pause"
                  onClick={() => {
                    stop.current = true;
                  }}
                >
                  完成此頁後暫停
                </button>
              )}
              {homepage && (
                <div className="wi-profile">
                  <span className="wi-kicker">品牌概覽</span>
                  <h3>{homepage.title}</h3>
                  {homepage.description && <p>{homepage.description}</p>}
                  <div>
                    {[
                      ...new Set(
                        job.state.pages.flatMap((p) => [
                          ...p.phones,
                          ...p.emails,
                          ...p.addresses,
                          ...p.hours,
                        ]),
                      ),
                    ]
                      .slice(0, 8)
                      .map((v) => (
                        <span key={v}>{v}</span>
                      ))}
                  </div>
                </div>
              )}
              {job.state.pages.length > 0 && (
                <div className="wi-sources">
                  <div className="wi-section-label">
                    <strong>來源與知識草稿</strong>
                    <span>{selected.length} 項已選</span>
                  </div>
                  {job.state.pages.map((page) => {
                    const candidates = job.state.candidates.filter(
                      (a) => a.website?.url === page.url,
                    );
                    return (
                      <details className="wi-page" key={page.id}>
                        <summary>
                          <span className="wi-page-icon">
                            <Globe2 size={15} />
                          </span>
                          <span>
                            <strong>{page.title}</strong>
                            <small>
                              {categoryLabels[page.category]} ·{" "}
                              {new Date(page.fetchedAt).toLocaleDateString(
                                "zh-HK",
                                { timeZone: "Asia/Hong_Kong" },
                              )}
                              {page.truncated ? " · 內容已截取" : ""}
                            </small>
                          </span>
                          <ChevronDown size={14} />
                        </summary>
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          查看原頁 <ArrowUpRight size={13} />
                        </a>
                        {candidates.map((a) => (
                          <div className="wi-candidate" key={a.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={selected.includes(a.id)}
                                disabled={!ready || importing}
                                onChange={(e) =>
                                  setSelected((ids) =>
                                    e.target.checked
                                      ? [...ids, a.id]
                                      : ids.filter((id) => id !== a.id),
                                  )
                                }
                              />
                              <span>{a.title}</span>
                            </label>
                            <p>{a.content}</p>
                          </div>
                        ))}
                      </details>
                    );
                  })}
                </div>
              )}
              {job.state.warnings.length > 0 && (
                <details className="wi-warnings">
                  <summary>{job.state.warnings.length} 頁未能讀取</summary>
                  {job.state.warnings.map((w, i) => (
                    <p key={i}>
                      <strong>{new URL(w.url).pathname}</strong> · {w.reason}
                    </p>
                  ))}
                </details>
              )}
              {(ready || job.status === "imported") && (
                <footer className="wi-footer">
                  <p>先存為草稿，核准後先供助手引用。相同內容會略過。</p>
                  <button
                    className="st-button st-primary"
                    disabled={
                      !ready || !selected.length || importing || !commit
                    }
                    onClick={() => void importDrafts()}
                  >
                    {importing ? (
                      <Loader2 size={15} className="wi-spin" />
                    ) : (
                      <ArrowDownToLine size={15} />
                    )}
                    {job.status === "imported"
                      ? "已加入知識庫"
                      : `加入 ${selected.length} 項草稿`}
                  </button>
                </footer>
              )}
              <p className="wi-muted">
                每次最多整理 {WEBSITE_LIMITS.pages}{" "}
                頁；登入內容及需要互動載入嘅資料可能無法讀取。
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
