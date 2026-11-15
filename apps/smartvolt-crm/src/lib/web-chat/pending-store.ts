import { chatStaffAction } from "./model";
export type PendingChatAction = {
  action: "reply" | "close" | "reopen" | "linkCustomer";
  commandId: string;
  threadId: string;
  revision: number;
  body?: string;
  customerId?: string;
};
const memory = new Map<string, string>(),
  unavailable = new Set<string>(),
  changed = "convelta:web-chat-pending-change";
/** Only the verified company + actor receives this tab's pending command journal. */
export function pendingChatKey(company: string, actor: string) {
  return `convelta:web-chat:pending:${company}:${actor}`;
}
export function pendingChatSnapshot(key: string) {
  if (typeof window === "undefined") return "{}";
  try {
    const stored = window.sessionStorage.getItem(key);
    if (stored !== null) {
      memory.set(key, stored);
      return stored;
    }
  } catch {
    unavailable.add(key);
  }
  return memory.get(key) ?? "{}";
}
export function parsePendingChat(
  value: string,
): Record<string, PendingChatAction> {
  if (value.length > 300000) return {};
  try {
    const raw = JSON.parse(value);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const valid: Record<string, PendingChatAction> = {};
    for (const [thread, entry] of Object.entries(raw).slice(0, 100)) {
      const parsed = chatStaffAction.safeParse(entry);
      if (parsed.success && parsed.data.threadId === thread)
        valid[thread] = parsed.data;
    }
    return valid;
  } catch {
    return {};
  }
}
export function subscribePendingChat(callback: () => void) {
  window.addEventListener(changed, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(changed, callback);
    window.removeEventListener("storage", callback);
  };
}
export function savePendingChat(
  key: string,
  thread: string,
  action: PendingChatAction | null,
) {
  const rows = parsePendingChat(pendingChatSnapshot(key));
  if (action && !rows[thread] && Object.keys(rows).length >= 100) return false;
  if (action) rows[thread] = action;
  else delete rows[thread];
  const next = JSON.stringify(rows);
  memory.set(key, next);
  try {
    window.sessionStorage.setItem(key, next);
    unavailable.delete(key);
  } catch {
    unavailable.add(key);
  }
  window.dispatchEvent(new Event(changed));
  return true;
}
export function pendingChatMemoryOnly(key: string) {
  return unavailable.has(key);
}
