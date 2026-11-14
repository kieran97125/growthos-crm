"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorState } from "@/lib/operations/editor";
const empty: EditorState = {
  held: false,
  occupied: false,
  actorName: null,
  revision: 0,
  expiresAt: null,
};
export function useReplyLease(
  company: string,
  provider: "meta" | "whatsapp" | undefined,
  thread: string | undefined,
  canEdit: boolean,
) {
  const key = provider && thread ? provider + ":" + thread : "",
    endpoint = `/api/companies/${company}/editor`,
    tokens = useRef(new Map<string, string>()),
    latest = useRef(""),
    activity = useRef(0),
    [state, setState] = useState<{ key: string; data: EditorState }>({
      key: "",
      data: empty,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    latest.current = key;
  }, [key]);
  const token = useCallback(() => {
    let v = tokens.current.get(key);
    if (!v) {
      v = crypto.randomUUID();
      tokens.current.set(key, v);
    }
    return v;
  }, [key]);
  const request = useCallback(
    async (
      mode: "read" | "acquire" | "heartbeat" | "takeover" | "release",
      revision?: number,
    ) => {
      if (!key || !provider || !thread || !canEdit) return null;
      const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            threadId: thread,
            token: token(),
            mode,
            ...(revision !== undefined ? { revision } : {}),
          }),
          keepalive: mode === "release",
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error ?? "暫時未能核對回覆狀態，草稿會保留。");
      if (latest.current === key) setState({ key, data: d });
      return d as EditorState;
    },
    [key, provider, thread, canEdit, endpoint, token],
  );
  const touch = useCallback(() => {
    activity.current = Date.now();
  }, []);
  const acquire = useCallback(
    async (takeover = false) => {
      if (!canEdit) return null;
      touch();
      setBusy(true);
      setError("");
      try {
        const d = await request(
          takeover ? "takeover" : "acquire",
          takeover && state.key === key ? state.data.revision : undefined,
        );
        return d?.held ? token() : null;
      } catch (e) {
        if (latest.current === key)
          setError(e instanceof Error ? e.message : "暫時未能核對回覆狀態。");
        return null;
      } finally {
        if (latest.current === key) setBusy(false);
      }
    },
    [canEdit, touch, request, state, key, token],
  );
  useEffect(() => {
    if (!key || !canEdit) return;
    let stopped = false;
    const refresh = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        await request(
          Date.now() - activity.current < 30000 ? "heartbeat" : "read",
        );
      } catch (e) {
        if (!stopped)
          setError(e instanceof Error ? e.message : "未能核對回覆狀態。");
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      void request("release").catch(() => {});
    };
  }, [key, canEdit, request]);
  return {
    state: state.key === key ? state.data : empty,
    error,
    busy,
    touch,
    acquire,
  };
}
