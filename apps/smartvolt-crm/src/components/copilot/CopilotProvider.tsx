"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { X, ArrowUpRight, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";
import type {
  CopilotContext,
  CopilotAnswer,
  CopilotRequest,
  Observation,
} from "@/lib/copilot/model";
import type { readCopilot } from "@/lib/copilot/server";
const Surface = lazy(() => import("./CopilotSurface"));
export type CopilotBundle = Awaited<ReturnType<typeof readCopilot>>;
type Pending = { request: CopilotRequest; proactive: boolean };
type CopilotState = {
  companyId: string;
  context: CopilotContext;
  bundle: CopilotBundle | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  loading: boolean;
  busy: boolean;
  error: string;
  notice: string;
  composer: string;
  setComposer: (v: string) => void;
  threadId: string;
  pending: Pending | null;
  uncertain: boolean;
  retryAction: () => Promise<boolean>;
  refresh: () => Promise<void>;
  newTask: () => void;
  selectThread: (id: string) => void;
  ask: (
    message: string,
    options?: { signal?: Observation; proactive?: boolean },
  ) => Promise<void>;
  act: (data: Record<string, unknown>) => Promise<boolean>;
  useObservation: (o: Observation) => void;
  setBrand: (id: string) => void;
};
const Context = createContext<CopilotState | null>(null);
export const useCopilot = () => useContext(Context);
const shortError = (e: unknown) =>
  e instanceof Error ? e.message : "C 暫時未能完成操作。";
function idleInput() {
  const el = document.activeElement;
  return (
    el instanceof HTMLElement &&
    (el.matches("input,textarea,select") || el.isContentEditable)
  );
}
export function CopilotProvider({
  companyId,
  identityKey,
  context: pageContext,
  children,
}: {
  companyId: string;
  identityKey: string;
  context: CopilotContext;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [bundle, setBundle] = useState<CopilotBundle | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [composer, setComposer] = useState(""),
    [threadId, setThreadId] = useState(() => {
      if (typeof window === "undefined") return "";
      let id = "";
      try {
        id =
          sessionStorage.getItem(
            `convelta:c:${companyId}:${identityKey}:${pageContext.product}`,
          ) ?? "";
      } catch {}
      return /^[a-f0-9-]{36}$/i.test(id) ? id : crypto.randomUUID();
    });
  const workScope = `${pageContext.product}:${pageContext.section}:${pageContext.customerId ?? ""}`;
  const [activityState, setActivity] = useState<{
      scope: string;
      activity: CopilotContext["activity"];
    }>({ scope: workScope, activity: "viewing" }),
    [peek, setPeek] = useState<{
      scope: string;
      signal: Observation;
      text: string;
      thread?: string;
    } | null>(null),
    [pending, setPending] = useState<Pending | null>(null);
  const activity =
    activityState.scope === workScope ? activityState.activity : "viewing";
  const [brandChoice, setBrandChoice] = useState<string | null>(null);
  const selectedBrand = pageContext.customerId
    ? pageContext.brandId
    : brandChoice === null
      ? pageContext.brandId
      : brandChoice || undefined;
  const context = useMemo(
    () => ({
      product: pageContext.product,
      section: pageContext.section,
      brandId: selectedBrand,
      customerId: pageContext.customerId,
      activity,
    }),
    [
      pageContext.product,
      pageContext.section,
      selectedBrand,
      pageContext.customerId,
      activity,
    ],
  );
  const key = JSON.stringify(context),
    endpoint = `/api/companies/${companyId}/copilot`,
    inflight = useRef(false),
    lastRead = useRef(0),
    lastPeek = useRef(0),
    alive = useRef(true),
    readVersion = useRef(0),
    proactiveThread = useRef("");
  const [retryCommand, setRetryCommand] = useState<Record<
    string,
    unknown
  > | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        document.querySelector<HTMLButtonElement>(".cc-launcher")?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  useEffect(() => {
    if (threadId)
      try {
        sessionStorage.setItem(
          `convelta:c:${companyId}:${identityKey}:${pageContext.product}`,
          threadId,
        );
      } catch {}
  }, [threadId, companyId, identityKey, pageContext.product]);
  const refresh = useCallback(async () => {
    const version = ++readVersion.current;
    setLoading(true);
    try {
      const q = new URLSearchParams({
          context: key,
          ...(threadId ? { thread: threadId } : {}),
        }),
        r = await fetch(endpoint + "?" + q, { cache: "no-store" }),
        data = await r.json();
      if (!r.ok) throw Error(data.error ?? "未能讀取 C 工作資料。");
      if (!data.ai || !Array.isArray(data.observations))
        throw Error("工作資料格式未能確認。");
      if (alive.current && version === readVersion.current) {
        setBundle(data);
        lastRead.current = Date.now();
      }
    } catch (e) {
      if (alive.current && version === readVersion.current)
        setError(shortError(e));
    } finally {
      if (alive.current && version === readVersion.current) setLoading(false);
    }
  }, [endpoint, key, threadId]);
  useEffect(() => {
    const timer = setTimeout(
      () => void refresh(),
      open || pageContext.section === "ai" ? 0 : 1400,
    );
    return () => clearTimeout(timer);
  }, [refresh, open, pageContext.section]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 1200);
    };
    const focus = (event: FocusEvent) => {
      const el = event.target;
      if (el instanceof HTMLElement) {
        const a = el.closest<HTMLElement>("[data-copilot-activity]")?.dataset
          .copilotActivity;
        if (
          a === "tagging" ||
          a === "replying" ||
          a === "booking" ||
          a === "campaign"
        )
          setActivity({ scope: workScope, activity: a });
      }
    };
    const visible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRead.current > 30000
      )
        void refresh();
    };
    const interval = setInterval(visible, 60000);
    window.addEventListener("convelta:data-changed", changed);
    window.addEventListener("focus", visible);
    document.addEventListener("focusin", focus);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("convelta:data-changed", changed);
      window.removeEventListener("focus", visible);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, workScope]);
  async function act(data: Record<string, unknown>) {
    // Preferences stay usable while C is thinking. They are independent,
    // reversible writes and retry the identical command after a lost response.
    if (data.action === "feedback") {
      const command = { ...data, commandId: crypto.randomUUID(), context };
      let failure: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(command),
          });
          const result = await r.json();
          if (!r.ok) {
            failure = Error(result.error ?? "未能保存提醒偏好。");
            if (r.status < 500) break;
            continue;
          }
          await refresh();
          return true;
        } catch (e) {
          failure = e;
        }
      }
      setError(shortError(failure));
      return false;
    }
    if (inflight.current) return false;
    if (retryCommand && data !== retryCommand) {
      setError("上一個操作結果未確認，請先核對同一操作。");
      return false;
    }
    const command = retryCommand ?? {
      ...data,
      commandId: crypto.randomUUID(),
      context,
    };
    inflight.current = true;
    setBusy(true);
    setError("");
    setRetryCommand(command);
    try {
      const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }),
        result = await r.json();
      if (!r.ok) {
        if (r.status < 500) setRetryCommand(null);
        throw Error(result.error ?? "操作結果未確認。");
      }
      setRetryCommand(null);
      setNotice(
        data.action === "tag"
          ? "標籤已確認並加入客戶檔案。"
          : data.action === "save-brief"
            ? "活動已保存為草稿，尚未推播。"
            : "已記住你嘅選擇。",
      );
      window.dispatchEvent(new Event("convelta:data-changed"));
      await refresh();
      return true;
    } catch (e) {
      setError(shortError(e));
      return false;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  async function ask(
    message: string,
    options?: { signal?: Observation; proactive?: boolean },
  ) {
    if (
      inflight.current ||
      retryCommand ||
      !message.trim() ||
      !threadId ||
      !bundle?.ai.canGenerate
    )
      return;
    const proactive = options?.proactive ?? false;
    const request = pending?.request ?? {
      requestId: crypto.randomUUID(),
      threadId: proactive
        ? (proactiveThread.current ||= crypto.randomUUID())
        : threadId,
      message: message.trim(),
      context,
      mode: proactive ? ("proactive" as const) : ("conversation" as const),
      ...(options?.signal ? { signalKey: options.signal.key } : {}),
    };
    inflight.current = true;
    setBusy(true);
    setPending({ request, proactive });
    setError("");
    if (!proactive) setComposer("");
    try {
      const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ask", request }),
        }),
        data = await r.json();
      if (!r.ok) {
        if (r.status < 500 || data.code) setPending(null);
        throw Error(data.error ?? "生成結果未確認，請核對同一請求。");
      }
      if (data.state === "running") {
        setNotice("C 仲處理緊同一請求；你可以繼續用其他功能，再核對結果。");
        return;
      }
      setPending(null);
      setNotice("");
      if (proactive && options?.signal)
        setPeek({
          scope: workScope,
          signal: options.signal,
          text: (data as CopilotAnswer).answer,
          thread: request.threadId,
        });
      await refresh();
    } catch (e) {
      if (!proactive) setError(shortError(e));
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  const currentBundle = useMemo(
    () =>
      bundle && bundle.context.product === context.product
        ? {
            ...bundle,
            messages: bundle.threadId === threadId ? bundle.messages : [],
            observations:
              bundle.context.customerId === context.customerId &&
              bundle.context.brandId === context.brandId
                ? bundle.observations
                : [],
          }
        : null,
    [bundle, context.product, context.customerId, context.brandId, threadId],
  );
  const onProactive = useEffectEvent((signal: Observation) => {
    if (
      idleInput() ||
      document.visibilityState !== "visible" ||
      inflight.current ||
      Date.now() - lastPeek.current < 180000
    )
      return;
    lastPeek.current = Date.now();
    setPeek({ scope: workScope, signal, text: signal.detail });
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "feedback",
        commandId: crypto.randomUUID(),
        context,
        key: signal.key,
        family: signal.family,
        subject: signal.subject,
        status: "seen",
      }),
    })
      .then((r) => {
        if (r.ok) void ask(signal.prompt, { signal, proactive: true });
      })
      .catch(() => {});
  });
  useEffect(() => {
    if (
      open ||
      busy ||
      pending ||
      !currentBundle?.ai.enabled ||
      !currentBundle.ai.verified ||
      !currentBundle.ai.canGenerate ||
      currentBundle.feedback.some(
        (f) =>
          f.updated_at &&
          Date.now() - new Date(f.updated_at).getTime() < 180000,
      )
    )
      return;
    const same =
      currentBundle.context.customerId === context.customerId &&
      currentBundle.context.brandId === context.brandId;
    const signal = same
      ? currentBundle.observations.find(
          (o) =>
            o.kind !== "setup" &&
            !currentBundle.feedback.some(
              (f) =>
                (f.signal_key === o.key || f.family === "quiet") &&
                new Date(f.until).getTime() > Date.now(),
            ),
        )
      : undefined;
    if (!signal) return;
    const timer = setTimeout(() => onProactive(signal), 6000);
    return () => clearTimeout(timer);
  }, [currentBundle, context, open, busy, pending]);
  function newTask() {
    if (inflight.current || pending || retryCommand) return;
    setThreadId(crypto.randomUUID());
    setComposer("");
    setError("");
    setNotice("");
  }
  function selectThread(id: string) {
    if (inflight.current || pending || retryCommand) return;
    setThreadId(id);
    setError("");
    setNotice("");
  }
  function useObservation(o: Observation) {
    if (pageContext.section !== "ai") setOpen(true);
    setComposer(o.prompt);
    setPeek(null);
    if (bundle?.ai.canGenerate)
      void act({
        action: "feedback",
        key: o.key,
        family: o.family,
        subject: o.subject,
        status: "seen",
      });
  }
  const state: CopilotState = {
    companyId,
    context,
    bundle: currentBundle,
    open,
    setOpen,
    loading,
    busy,
    error,
    notice,
    composer,
    setComposer,
    threadId,
    pending,
    uncertain: !!retryCommand,
    retryAction: () => act(retryCommand ?? {}),
    refresh,
    newTask,
    selectThread,
    ask,
    act,
    useObservation,
    setBrand: setBrandChoice,
  };
  return (
    <Context.Provider value={state}>
      {children}
      {peek &&
        peek.scope === workScope &&
        !open &&
        currentBundle?.context.brandId === context.brandId &&
        currentBundle?.observations.some((o) => o.key === peek.signal.key) && (
          <aside className="cc-peek" aria-label="C 主動觀察">
            <div>
              <BrandMark size={26} />
              <b>C 留意到一件事</b>
              <button
                aria-label="稍後提醒呢個觀察"
                onClick={() => {
                  void act({
                    action: "feedback",
                    key: peek.signal.key,
                    family: peek.signal.family,
                    subject: peek.signal.subject,
                    status: "snoozed",
                  });
                  setPeek(null);
                }}
              >
                <X size={16} />
              </button>
            </div>
            <strong>{peek.signal.title}</strong>
            <p>{peek.text.replace(/\[[^\]]+\]/g, "")}</p>
            <button
              className="cc-inline"
              onClick={() => {
                if (peek.thread) setThreadId(peek.thread);
                else setComposer(peek.signal.prompt);
                setOpen(true);
                setPeek(null);
              }}
            >
              同 C 一齊睇
              <ArrowUpRight size={14} />
            </button>
          </aside>
        )}
      {open && (
        <aside className="cc-dock" aria-label="C 全能助手">
          <header>
            <BrandMark size={30} />
            <div>
              <b>C</b>
              <small>你嘅 Convelta 營運夥伴</small>
            </div>
            <Link
              className="cc-expand"
              href={`/company/${companyId}/copilot?${new URLSearchParams({ product: context.product, ...(context.customerId ? { contact: context.customerId } : {}), ...(context.brandId ? { brand: context.brandId } : {}) })}`}
              onClick={() => setOpen(false)}
              aria-label="展開 C 工作台"
            >
              <ArrowUpRight size={17} />
            </Link>
            <button aria-label="關閉 C 全能助手" onClick={() => setOpen(false)}>
              <X size={19} />
            </button>
          </header>
          <Suspense fallback={<p className="cc-status">正在開啟 C…</p>}>
            <Surface compact />
          </Suspense>
        </aside>
      )}
    </Context.Provider>
  );
}
export function CLauncher() {
  const c = useCopilot();
  return (
    <button
      className="cc-launcher"
      aria-label="開啟 C 全能助手"
      aria-expanded={c?.open ?? false}
      onClick={() => c?.setOpen(!c.open)}
    >
      <BrandMark size={34} />
    </button>
  );
}
export function CHeaderButton() {
  const c = useCopilot(),
    count =
      c?.bundle?.observations.filter((o) => o.kind !== "setup").length ?? 0;
  return (
    <button
      className="cc-header-button"
      onClick={() => c?.setOpen(!c.open)}
      aria-label={`C 工作觀察${count ? `，${count} 項` : ""}`}
    >
      <Sparkles size={17} />
      <span>C</span>
      {count > 0 && <i>{count}</i>}
    </button>
  );
}
export function CTagHint({ customerId }: { customerId: string }) {
  const c = useCopilot(),
    signal = c?.bundle?.observations.find(
      (o) => o.action.kind === "tag" && o.action.customerId === customerId,
    );
  return c && signal ? (
    <div className="cc-tag-inline">
      <button type="button" onClick={() => c.useObservation(signal)}>
        <Sparkles size={14} />
        {signal.title}
        <ArrowUpRight size={13} />
      </button>
    </div>
  ) : null;
}
