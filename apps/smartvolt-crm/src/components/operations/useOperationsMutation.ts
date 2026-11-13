"use client";
import { useRef, useState } from "react";
import {
  operationsAction,
  type OperationsAction,
} from "@/lib/operations/model";

export function useOperationsMutation(companyId: string, saved: () => void) {
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<OperationsAction | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false),
    unresolved = useRef<OperationsAction | null>(null);
  async function run(input: OperationsAction): Promise<boolean> {
    if (lock.current) return false;
    const data = operationsAction.safeParse(unresolved.current ?? input);
    if (!data.success) {
      setError(data.error.issues[0]?.message ?? "請核對輸入資料。");
      return false;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    unresolved.current = data.data;
    setPending(data.data);
    try {
      const r = await fetch(`/api/companies/${companyId}/operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.data),
      });
      const body = await r.json();
      if (!r.ok) {
        if (r.status < 500) {
          unresolved.current = null;
          setPending(null);
        }
        if (r.status === 409) saved();
        throw new Error(body.error ?? "未能確認儲存結果。");
      }
      unresolved.current = null;
      setPending(null);
      setNotice("已儲存。");
      saved();
      window.dispatchEvent(new Event("convelta:data-changed"));
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "連線結果未確認，請核對同一操作。",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { run, busy, pending, error, notice, locked: busy || !!pending };
}
