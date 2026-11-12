"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useIdentity } from "@/lib/saas/CompanyProvider";
import { Bot } from "lucide-react";
import { Modal } from "@/components/crm/conversations/WorkspacePrimitives";
type Connection = {
  status: "unconfigured" | "ready";
  model: string | null;
  blocker?: string | null;
  refresh: () => Promise<void>;
};
const Context = createContext<Connection | null>(null);
export function AIProvider({ children }: { children: ReactNode }) {
  const identity = useIdentity();
  const [value, setValue] = useState<{
    status: "unconfigured" | "ready";
    model: string | null;
    blocker?: string | null;
  }>({ status: "unconfigured", model: null });
  const load = useCallback(async () => {
    const r = await fetch(
        `/api/ai/status?companyId=${encodeURIComponent(identity.scope.companyId)}`,
        { cache: "no-store" },
      ),
      data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "未能核對公司 AI。");
    return {
      status:
        data.status === "ready"
          ? ("ready" as const)
          : ("unconfigured" as const),
      model: data.model ?? null,
      blocker: data.blocker ?? null,
    };
  }, [identity.scope.companyId]);
  const refresh = useCallback(async () => {
    if (identity.connected) setValue(await load());
  }, [identity.connected, load]);
  useEffect(() => {
    if (!identity.connected) return;
    let active = true;
    void load()
      .then((data) => {
        if (active) setValue(data);
      })
      .catch((e) => {
        if (active)
          setValue({ status: "unconfigured", model: null, blocker: e.message });
      });
    return () => {
      active = false;
    };
  }, [identity.connected, load]);
  return (
    <Context.Provider value={{ ...value, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function useAIConnection() {
  const value = useContext(Context);
  if (!value) throw Error("Missing AIProvider");
  return value;
}
export function AIConnectButton() {
  const [open, setOpen] = useState(false);
  const connection = useAIConnection(),
    identity = useIdentity();
  return (
    <>
      <button className="ai-connect" onClick={() => setOpen(true)}>
        <Bot size={14} />
        AI 設定
      </button>
      {open && (
        <Modal
          title="公司 AI 助手"
          subtitle="公司知識與用量分開管理"
          onClose={() => setOpen(false)}
        >
          <div className="ai-access">
            <Bot size={28} />
            <h3>
              {connection.status === "ready"
                ? "真實 AI 回覆助手已連線"
                : "公司 AI 設定"}
            </h3>
            <p>
              {identity.connected
                ? connection.status === "ready"
                  ? `使用 ${connection.model}，只讀取公司已核准知識，準備建議畀同事確認。`
                  : (connection.blocker ?? "正在核對公司 AI 連線。")
                : "呢個係公開示範工作空間。示範引擎唔會呼叫真實模型。"}
            </p>
            {identity.connected && (
              <p>
                <Link href={`/company/${identity.scope.companyId}/crm/ai`}>
                  開啟 AI 工作室，查看知識與用量
                </Link>
              </p>
            )}
            <button onClick={() => setOpen(false)}>返回工作台</button>
          </div>
        </Modal>
      )}
    </>
  );
}
