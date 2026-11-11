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
export type Snapshot = {
  state: AppState;
  ready: boolean;
  now: number;
  storage: string;
};
function createStore(initialState?: AppState, storageKey = APP_STORAGE) {
  const server: Snapshot = {
    state: initialState ?? createAppState(0),
    ready: false,
    now: 0,
    storage: "此瀏覽器自動儲存",
  };
  let cached: Snapshot | null = null;
  const listeners = new Set<() => void>();
  const get = () => {
    if (cached) return cached;
    let storage = server.storage,
      state = initialState ?? createAppState(Date.now());
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        if (raw.length > 4000000) throw Error("Storage too large");
        const p = appSchema.safeParse(JSON.parse(raw));
        if (
          p.success &&
          p.data.scope?.companyId === initialState?.scope?.companyId
        )
          state = p.data;
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
      next =
        a.type === "reset" && initialState?.scope
          ? (() => {
              const seed = createAppState(a.at);
              seed.scope = initialState.scope;
              seed.inbox.contacts.forEach((c) => {
                c.clientId = initialState.scope!.companyId;
              });
              seed.inbox.conversations.forEach((c) => {
                c.clientId = initialState.scope!.companyId;
              });
              seed.studio.flows.forEach((f) => {
                f.clientId = initialState.scope!.companyId;
              });
              seed.studio.articles.forEach((a) => {
                a.clientId = initialState.scope!.companyId;
              });
              return seed;
            })()
          : appReducer(current.state, a);
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
      localStorage.setItem(storageKey, raw);
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
export const WorkspaceContext = createContext<Store | null>(null);
export function DemoProvider({
  children,
  initialState,
  storageKey,
}: {
  children: ReactNode;
  initialState?: AppState;
  storageKey?: string;
}) {
  const [store] = useState(() => createStore(initialState, storageKey));
  return (
    <WorkspaceContext.Provider value={store}>
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useDemo() {
  const s = useContext(WorkspaceContext);
  if (!s) throw Error("Missing DemoProvider");
  return {
    ...useSyncExternalStore(s.subscribe, s.get, s.getServer),
    dispatch: s.dispatch,
  };
}
