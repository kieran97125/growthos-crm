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
  useEffect(() => () => active.current?.abort(), []);
  const cancel = () => {
    active.current?.abort();
    setBusy(false);
    setError("");
  };
  const ask = async (
    input: AssistantInput,
    demo = false,
  ): Promise<LiveAnswer | null> => {
    active.current?.abort();
    setError("");
    if (demo)
      return { ...suggestReply({ ...input, now: Date.now() }), engine: "demo" };
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          companyId: identity.connected ? identity.scope.companyId : undefined,
        }),
        signal: controller.signal,
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error ?? "AI 未能完成回覆。");
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
