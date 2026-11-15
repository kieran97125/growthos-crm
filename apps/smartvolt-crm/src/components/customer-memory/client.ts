"use client";
import { useCallback, useSyncExternalStore } from "react";
import type {
  CustomerMemoryPage,
  MemoryCategory,
  MemoryCommand,
} from "@/lib/customer-memory/model";

export class MemoryRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function memoryRequest<T>(
  url: string,
  command?: MemoryCommand,
): Promise<T> {
  const response = await fetch(url, {
    method: command ? "POST" : "GET",
    cache: "no-store",
    ...(command
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new MemoryRequestError(
      data.error ?? "暫時未能讀取客戶記憶。",
      response.status,
    );
  return data;
}

export async function readMemoryPage(
  url: string,
  customerId: string,
  brandId?: string,
): Promise<CustomerMemoryPage> {
  const page = await memoryRequest<CustomerMemoryPage>(url);
  if (
    !page ||
    page.customerId !== customerId ||
    typeof page.brandId !== "string" ||
    (brandId && page.brandId !== brandId) ||
    !Array.isArray(page.brands) ||
    !Array.isArray(page.memories) ||
    !Array.isArray(page.history) ||
    !Array.isArray(page.timeline) ||
    !page.coverage ||
    typeof page.coverage.moreHistory !== "boolean"
  )
    throw new MemoryRequestError("未能核對客戶記憶，請重新讀取。", 502);
  return page;
}

export type MemoryEditor = {
  action: "save" | "archive";
  memoryId: string;
  expectedRevision: number;
  category: MemoryCategory;
  content: string;
  reason: string;
};
type Draft = {
  editor: MemoryEditor | null;
  pending: MemoryCommand | null;
  busy: boolean;
  error: string;
  notice: string;
  conflict: boolean;
};
const empty: Draft = {
  editor: null,
  pending: null,
  busy: false,
  error: "",
  notice: "",
  conflict: false,
};
// Page-session state only. No customer notes are written to browser storage.
// Scope keys let an unfinished edit survive a customer/brand switch without
// applying its late response to the newly selected customer.
const drafts = new Map<string, Draft>();
const listeners = new Map<string, Set<() => void>>();
export function updateMemoryDraft(scope: string, patch: Partial<Draft>) {
  drafts.set(scope, { ...(drafts.get(scope) ?? empty), ...patch });
  if (drafts.size > 32) {
    for (const [key, draft] of drafts) {
      if (
        key !== scope &&
        !listeners.get(key)?.size &&
        !draft.pending &&
        !draft.editor
      )
        drafts.delete(key);
      if (drafts.size <= 32) break;
    }
  }
  for (const notify of listeners.get(scope) ?? []) notify();
}
export function readMemoryDraft(scope: string) {
  return drafts.get(scope) ?? empty;
}
export function useMemoryDraft(scope: string) {
  const subscribe = useCallback(
    (notify: () => void) => {
      let scoped = listeners.get(scope);
      if (!scoped) listeners.set(scope, (scoped = new Set()));
      scoped.add(notify);
      return () => {
        scoped.delete(notify);
        if (!scoped.size) listeners.delete(scope);
      };
    },
    [scope],
  );
  const snapshot = useCallback(() => readMemoryDraft(scope), [scope]);
  return useSyncExternalStore(subscribe, snapshot, () => empty);
}
