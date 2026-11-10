"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Bot, Check, KeyRound, LoaderCircle, Sparkles } from "lucide-react";
import { Modal } from "@/components/crm/conversations/WorkspacePrimitives";
type Status = {
  status: "checking" | "locked" | "ready" | "unconfigured";
  model: string | null;
};
const Context = createContext<
  (Status & { refresh: () => Promise<void> }) | null
>(null);
export function AIProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Status>({
    status: "checking",
    model: null,
  });
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/ai/status", { cache: "no-store" });
      if (!r.ok) throw Error();
      setState(await r.json());
    } catch {
      setState({ status: "unconfigured", model: null });
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  return (
    <Context.Provider value={{ ...state, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function useAIConnection() {
  const c = useContext(Context);
  if (!c) throw Error("Missing AIProvider");
  return c;
}
export function AIConnectButton() {
  const ai = useAIConnection(),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="ai-connect"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <span className={ai.status === "ready" ? "is-ready" : ""} />
        {ai.status === "ready" ? "AI 已啟用" : "啟用 AI"}
        <Sparkles size={13} />
      </button>
      {open && (
        <Modal
          title="AI 體驗連線"
          subtitle="真實模型由獨立 Vercel Project 提供。"
          onClose={() => setOpen(false)}
        >
          <div className="ai-access">
            <span className="ai-access-icon">
              <Bot size={27} />
            </span>
            <h3>
              {ai.status === "ready"
                ? "已啟用真實 AI 回覆"
                : "啟用真實 AI 回覆"}
            </h3>
            <p>
              會將你選取嘅對話及有效品牌知識交予 AI 準備建議。唔會連接真實
              WhatsApp、公司資料庫或其他公司項目。
            </p>
            {ai.status === "ready" ? (
              <>
                <div className="ai-access-success">
                  <Check size={17} />
                  {ai.model}
                </div>
                <button onClick={() => setOpen(false)}>返回體驗</button>
              </>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  const code = String(
                    new FormData(e.currentTarget).get("code") ?? "",
                  );
                  try {
                    const r = await fetch("/api/demo-access", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ code }),
                    });
                    const data = await r.json();
                    if (!r.ok) throw Error(data.error);
                    await ai.refresh();
                    setOpen(false);
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "未能啟用，請稍後再試。",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  <KeyRound size={13} />
                  專用體驗碼
                  <input
                    type="password"
                    name="code"
                    required
                    maxLength={100}
                    autoComplete="off"
                    placeholder="輸入提供畀你嘅 AI 體驗碼"
                  />
                </label>
                {error && (
                  <p role="alert" className="ai-error">
                    {error}
                  </p>
                )}
                <button disabled={busy || ai.status === "unconfigured"}>
                  {busy ? (
                    <LoaderCircle size={15} className="ai-spin" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  啟用 AI 體驗
                </button>
                {ai.status === "unconfigured" && (
                  <p className="ai-error">
                    此部署尚未配置模型連線。其他 Demo 功能可以照常體驗。
                  </p>
                )}
              </form>
            )}
            <small>只授權當前瀏覽器一小時，金鑰不會存入前端。</small>
          </div>
        </Modal>
      )}
    </>
  );
}
