"use client";
import { useIdentity } from "@/lib/saas/CompanyProvider";
import { useEffect, useRef, useState } from "react";
import { suggestReply } from "@/components/crm/studio/engine";
import type { AssistantInput, LiveAnswer } from "./ai-contract";
export function useAssistant() {
  const identity = useIdentity();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const pending = useRef<{ key: string; body: Record<string, unknown> } | null>(
    null,
  );
  useEffect(() => () => active.current?.abort(), []);
  const cancel = () => {
    active.current?.abort();
    setBusy(false);
    setError("");
  };
  const ask = async (
    input: AssistantInput,
    demo = false,
    context?: { conversationId: string },
  ): Promise<LiveAnswer | null> => {
    active.current?.abort();
    setError("");
    if (demo)
      return { ...suggestReply({ ...input, now: Date.now() }), engine: "demo" };
    if (!identity.connected) {
      setError("請先登入公司工作空間，或使用清楚標示嘅示範引擎。");
      return null;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    try {
      const base = {
        companyId: identity.scope.companyId,
        brandId: input.brandId,
        ...(context
          ? { source: "conversation", conversationId: context.conversationId }
          : { source: "playground", message: input.message }),
      };
      const key = JSON.stringify(base);
      const body =
        pending.current?.key === key
          ? pending.current.body
          : { ...base, requestId: crypto.randomUUID() };
      pending.current = { key, body };
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await r.json();
      if (data.state === "running")
        throw Error("AI 仲處理緊同一個請求，請稍後核對結果。");
      if (!r.ok) {
        if (data.code || r.status < 500) pending.current = null;
        throw Error(data.error ?? "AI 未能完成回覆。");
      }
      pending.current = null;
      return data as LiveAnswer;
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "連線中斷，請再試。");
      return null;
    } finally {
      if (active.current === controller) setBusy(false);
    }
  };
  return { ask, cancel, busy, error };
}
