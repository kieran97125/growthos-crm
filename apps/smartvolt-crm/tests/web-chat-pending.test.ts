import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  pendingChatKey,
  pendingChatSnapshot,
  parsePendingChat,
  savePendingChat,
  pendingChatMemoryOnly,
} from "../src/lib/web-chat/pending-store";
test("pending journals isolate verified company and actor, validate immutable payloads and survive a fresh read", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const entries = new Map<string, string>(),
    events = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, value),
      },
      dispatchEvent: (event: Event) => events.dispatchEvent(event),
    },
  });
  try {
    const company = randomUUID(),
      actor = randomUUID(),
      thread = randomUUID(),
      key = pendingChatKey(company, actor),
      payload = {
        action: "reply" as const,
        commandId: randomUUID(),
        threadId: thread,
        revision: 3,
        body: "Keep exact request",
      };
    assert.equal(savePendingChat(key, thread, payload), true);
    assert.deepEqual(
      parsePendingChat(pendingChatSnapshot(key))[thread],
      payload,
    );
    assert.deepEqual(
      parsePendingChat(
        pendingChatSnapshot(pendingChatKey(company, randomUUID())),
      ),
      {},
    );
    assert.deepEqual(
      parsePendingChat(
        pendingChatSnapshot(pendingChatKey(randomUUID(), actor)),
      ),
      {},
    );
    assert.deepEqual(
      parsePendingChat(
        JSON.stringify({ [thread]: { ...payload, threadId: randomUUID() } }),
      ),
      {},
    );
    assert.equal(savePendingChat(key, thread, null), true);
    assert.deepEqual(parsePendingChat(pendingChatSnapshot(key)), {});
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
test("blocked browser storage keeps exact retry identity in memory without throwing", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem() {
          throw new Error("blocked");
        },
        setItem() {
          throw new Error("blocked");
        },
      },
      dispatchEvent() {
        return true;
      },
    },
  });
  try {
    const thread = randomUUID(),
      key = pendingChatKey(randomUUID(), randomUUID()),
      payload = {
        action: "close" as const,
        commandId: randomUUID(),
        threadId: thread,
        revision: 1,
      };
    assert.equal(savePendingChat(key, thread, payload), true);
    assert.equal(pendingChatMemoryOnly(key), true);
    assert.equal(
      parsePendingChat(pendingChatSnapshot(key))[thread].commandId,
      payload.commandId,
    );
    savePendingChat(key, thread, null);
    assert.deepEqual(parsePendingChat(pendingChatSnapshot(key)), {});
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
