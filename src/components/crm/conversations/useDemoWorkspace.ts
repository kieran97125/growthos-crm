"use client";

import { useState, useSyncExternalStore } from "react";
import {
  createDemoState,
  demoReducer,
  stateSchema,
  STORAGE_KEY,
  type Action,
  type DemoState,
} from "./model";

type Snapshot = {
  state: DemoState;
  ready: boolean;
  now: number;
  storage: string;
};

// Each mounted workspace owns its store. No browser or tenant state lives on the server.
function createWorkspaceStore(enabled: boolean, initialNow = 0) {
  const server: Snapshot = {
    state: createDemoState(initialNow),
    ready: false,
    now: initialNow,
    storage: "此瀏覽器自動儲存",
  };
  let snapshot: Snapshot | null = null;
  const listeners = new Set<() => void>();
  function getSnapshot(): Snapshot {
    if (snapshot) return snapshot;
    if (!enabled) return server;
    const now = initialNow || Date.now();
    let state = createDemoState(now);
    let storage = server.storage;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed =
          saved.length < 4000000
            ? stateSchema.safeParse(JSON.parse(saved))
            : null;
        if (parsed?.success) state = parsed.data;
        else storage = "舊示範已更新，重新開始";
      }
    } catch {
      storage = "本次操作只保留至頁面關閉";
    }
    snapshot = { state, ready: true, now, storage };
    return snapshot;
  }
  const notify = () => listeners.forEach((listener) => listener());
  function dispatch(action: Action) {
    if (!enabled) return;
    const current = getSnapshot();
    const state = demoReducer(current.state, action);
    if (state === current.state) return;
    let storage = current.storage;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storage = "此瀏覽器自動儲存";
    } catch {
      storage = "本次操作未能儲存，關閉頁面後會重設";
    }
    snapshot = { ...current, state, storage, now: Date.now() };
    notify();
  }
  function subscribe(listener: () => void) {
    listeners.add(listener);
    const timer = window.setInterval(() => {
      snapshot = { ...getSnapshot(), now: Date.now() };
      notify();
    }, 30000);
    return () => {
      listeners.delete(listener);
      clearInterval(timer);
    };
  }
  return { getSnapshot, getServerSnapshot: () => server, subscribe, dispatch };
}

export function useDemoWorkspace(enabled: boolean, initialNow?: number) {
  const [store] = useState(() => createWorkspaceStore(enabled, initialNow));
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { ...snapshot, dispatch: store.dispatch };
}
