"use client";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Globe2,
  Loader2,
  ScanLine,
} from "lucide-react";
import { WebsiteImportCommitContext } from "@/lib/saas/CompanyProvider";
import { websiteJobSchema, type WebsiteJob } from "@/lib/website/model";
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
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<WebsiteJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const live = useRef(true),
    stop = useRef(false),
    working = useRef(false);
  const initialRead = useRef<AbortController | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const endpoint = `/api/companies/${companyId}/knowledge/website`;
  const post = useCallback(
    async (body: object) => {
      const controller = new AbortController();
      requestController.current = controller;
      const r = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error ?? "網站掃描未完成，請再試一次。");
      return websiteJobSchema.parse(data.job);
    },
    [endpoint],
  );

  const run = useCallback(
    async (previous: WebsiteJob | null, inputUrl?: string) => {
      if (working.current) return;
      working.current = true;
      stop.current = false;
      setBusy(true);
      setError("");
      try {
        let current =
          previous ??
          (await post({
            kind: "start",
            id: crypto.randomUUID(),
            brandId,
            url: inputUrl,
          }));
        if (live.current) setJob(current);
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
          if (live.current) setJob(current);
        }
        if (live.current && !stop.current && current.status === "ready") {
          if (!current.state.candidates.length)
            throw Error("未搵到可用嘅網站內容，可以直接新增 FAQ。");
          if (!commit) throw Error("登入公司後就可以儲存 FAQ。");
          setPublishing(true);
          const result = await commit({
            id: current.id,
            selected: current.state.candidates.map((a) => a.id),
          });
          if (live.current)
            setJob({ ...current, ...result, status: "imported" });
        } else if (current.status === "failed") {
          throw Error(
            current.state.warnings[0]?.reason ??
              "暫時讀唔到呢個網站，請檢查網址後再試。",
          );
        }
      } catch (e) {
        if (live.current)
          setError(
            e instanceof Error && e.name !== "AbortError"
              ? e.message
              : "掃描已暫停，可以繼續。",
          );
      } finally {
        working.current = false;
        if (live.current) {
          setBusy(false);
          setPublishing(false);
        }
      }
    },
    [post, brandId, commit],
  );

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
        const data = await r.json();
        if (!r.ok) throw Error(data.error ?? "暫時未能讀取網站資料。");
        if (!live.current || controller.signal.aborted) return;
        const next = data.job ? websiteJobSchema.parse(data.job) : null;
        setJob(next);
        if (next) setUrl(next.state.inputUrl);
        // Legacy previews remain untouched. New FAQ scans resume and publish automatically.
        if (
          next &&
          (next.status === "queued" ||
            next.status === "running" ||
            (next.status === "ready" && next.state.format === "faq"))
        )
          await run(next);
      })
      .catch((e) => {
        if (live.current && !controller.signal.aborted)
          setError(e instanceof Error ? e.message : "暫時未能讀取網站資料。");
      });
    return () => {
      live.current = false;
      stop.current = true;
      controller.abort();
      requestController.current?.abort();
    };
  }, [connected, endpoint, brandId, run]);

  const complete = job?.status === "imported";
  const resume =
    job &&
    ["queued", "running", "ready"].includes(job.status) &&
    job.state.format === "faq";
  return (
    <section className="wi-card" aria-label="網站掃描">
      <div className="wi-heading">
        <span className="wi-globe">
          <Globe2 size={21} />
        </span>
        <div>
          <h2>由網站建立 FAQ</h2>
          <p>貼上網址，掃完即刻可以用。</p>
        </div>
      </div>
      <form
        className="wi-url"
        onSubmit={(e) => {
          e.preventDefault();
          initialRead.current?.abort();
          void run(null, url);
        }}
      >
        <label>
          <Globe2 size={17} />
          <input
            aria-label="品牌網站網址"
            placeholder="輸入品牌網站，例如 your-brand.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={2048}
            disabled={busy || !connected}
          />
        </label>
        <button
          className="st-button st-primary"
          type="submit"
          disabled={!url.trim() || busy || !connected}
        >
          {busy ? (
            <Loader2 size={17} className="wi-spin" />
          ) : (
            <ScanLine size={17} />
          )}
          {busy
            ? publishing
              ? "正在整理 FAQ"
              : "掃描中"
            : job
              ? "重新掃描"
              : "掃描網站"}
        </button>
      </form>
      {!connected && <p className="wi-muted">登入公司後即可掃描網站。</p>}
      {busy && (
        <div className="wi-progress" role="status">
          <span>
            {publishing
              ? "正在儲存 FAQ…"
              : `正在讀取網站${job?.state.pages.length ? ` · 已讀取 ${job.state.pages.length} 頁` : "…"}`}
          </span>
          {!publishing && (
            <button
              type="button"
              onClick={() => {
                stop.current = true;
              }}
            >
              暫停
            </button>
          )}
        </div>
      )}
      {!busy && complete && (
        <p className="wi-success" role="status">
          <CheckCircle2 size={16} />
          {job.added || job.refreshed
            ? `已整理 ${job.added + job.refreshed} 條 FAQ，C 可以使用。`
            : "網站資料已更新。"}
        </p>
      )}
      {error && (
        <p className="wi-error" role="alert">
          {error}
        </p>
      )}
      {!busy && resume && (
        <button
          className="st-button"
          type="button"
          onClick={() => void run(job)}
        >
          繼續掃描
        </button>
      )}
      {!busy && !!job?.state.warnings.length && (
        <details className="wi-warnings">
          <summary>
            {job.state.warnings.length} 頁未能讀取 <ChevronDown size={13} />
          </summary>
          {job.state.warnings.map((w, i) => (
            <p key={i}>
              {new URL(w.url).pathname} · {w.reason}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
