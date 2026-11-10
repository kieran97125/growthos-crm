"use client";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  APP_STORAGE,
  appReducer,
  appSchema,
  createAppState,
  type AppState,
  type AppAction,
} from "./state";
type Snapshot = {
  state: AppState;
  ready: boolean;
  now: number;
  storage: string;
};
function createStore() {
  const server: Snapshot = {
    state: createAppState(0),
    ready: false,
    now: 0,
    storage: "此瀏覽器自動儲存",
  };
  let cached: Snapshot | null = null;
  const listeners = new Set<() => void>();
  const get = () => {
    if (cached) return cached;
    let storage = server.storage,
      state = createAppState(Date.now());
    try {
      const raw = localStorage.getItem(APP_STORAGE);
      if (raw) {
        if (raw.length > 4000000) throw Error("Storage too large");
        const p = appSchema.safeParse(JSON.parse(raw));
        if (p.success) state = p.data;
        else storage = "舊資料未通過驗證，已開啟全新 Demo";
      }
    } catch {
      storage = "本機資料未能讀取；請保留此頁面";
    }
    cached = { state, ready: true, now: Date.now(), storage };
    return cached;
  };
  const dispatch = (a: AppAction) => {
    const current = get(),
      next = appReducer(current.state, a);
    if (next === current.state) return;
    if (!appSchema.safeParse(next).success) {
      cached = {
        ...current,
        storage: "改動未通過資料驗證或已達 Demo 上限，未有寫入。",
      };
      listeners.forEach((f) => f());
      return;
    }
    let storage = server.storage;
    try {
      const raw = JSON.stringify(next);
      if (raw.length > 4000000) throw Error("Storage limit");
      localStorage.setItem(APP_STORAGE, raw);
    } catch {
      storage = "改動未能儲存，請匯出或保留此頁面";
    }
    cached = { state: next, ready: true, now: Date.now(), storage };
    listeners.forEach((f) => f());
  };
  return {
    get,
    getServer: () => server,
    dispatch,
    subscribe: (f: () => void) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
  };
}
type Store = ReturnType<typeof createStore>;
const Context = createContext<Store | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useDemo() {
  const s = useContext(Context);
  if (!s) throw Error("Missing DemoProvider");
  return {
    ...useSyncExternalStore(s.subscribe, s.get, s.getServer),
    dispatch: s.dispatch,
  };
}
