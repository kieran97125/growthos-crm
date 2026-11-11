"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Bot } from "lucide-react";
import { Modal } from "@/components/crm/conversations/WorkspacePrimitives";
type Connection = {
  status: "unconfigured" | "ready";
  model: string | null;
  refresh: () => Promise<void>;
};
const Context = createContext<Connection | null>(null);
export function AIProvider({ children }: { children: ReactNode }) {
  return (
    <Context.Provider
      value={{ status: "unconfigured", model: null, refresh: async () => {} }}
    >
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
            <h3>真實模型尚未啟用</h3>
            <p>
              Flow 及 AI BOT
              設計、知識編輯同清楚標示嘅示範引擎可以使用。正式模型需要完成此公司嘅連線、用量配額及知識驗證。
            </p>
            <p>啟用進度記錄喺公司設定嘅系統工作卡。</p>
            <button onClick={() => setOpen(false)}>返回工作台</button>
          </div>
        </Modal>
      )}
    </>
  );
}
