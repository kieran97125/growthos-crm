"use client";
import { useRef, useState } from "react";
export function useRecordedCommand(
  endpoint: string,
  onSaved: () => Promise<unknown>,
) {
  const pending = useRef<unknown>(null),
    lock = useRef(false),
    [busy, setBusy] = useState(false),
    [frozen, setFrozen] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function send(input: unknown) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    if (!pending.current) pending.current = input;
    setFrozen(true);
    try {
      const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending.current),
        }),
        d = await r.json();
      if (!r.ok) {
        if (r.status < 500) {
          pending.current = null;
          setFrozen(false);
        }
        throw Error(d.error ?? "未能完成，請再核對。");
      }
      pending.current = null;
      setFrozen(false);
      setNotice("已儲存。");
      try {
        await onSaved();
      } catch {
        setNotice("已儲存，暫時未能更新畫面；請重新整理。");
      }
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "未能確認結果，請核對同一請求。",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    send,
    retry: () => send(pending.current),
    busy,
    frozen,
    error,
    notice,
  };
}
