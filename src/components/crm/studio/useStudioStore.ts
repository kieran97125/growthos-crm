"use client";
import { useState, useSyncExternalStore } from "react";
import {
  createStudioState,
  studioReducer,
  studioSchema,
  STUDIO_STORAGE,
  type StudioAction,
  type StudioState,
} from "./model";
type Snapshot = { state: StudioState; ready: boolean; storageError: boolean };
function createStore(enabled: boolean) {
  const server: Snapshot = {
    state: createStudioState(),
    ready: false,
    storageError: false,
  };
  let snapshot: Snapshot | null = null;
  const listeners = new Set<() => void>();
  const getSnapshot = () => {
    if (snapshot) return snapshot;
    if (!enabled) return server;
    let state = server.state,
      storageError = false;
    try {
      const value = localStorage.getItem(STUDIO_STORAGE);
      if (value && value.length < 3000000) {
        const parsed = studioSchema.safeParse(JSON.parse(value));
        if (parsed.success) state = parsed.data;
        else storageError = true;
      }
    } catch {
      storageError = true;
    }
    snapshot = { state, ready: true, storageError };
    return snapshot;
  };
  const dispatch = (action: StudioAction) => {
    if (!enabled) return;
    const current = getSnapshot(),
      state = studioReducer(current.state, action);
    if (state === current.state) return;
    let storageError = false;
    try {
      localStorage.setItem(STUDIO_STORAGE, JSON.stringify(state));
    } catch {
      storageError = true;
    }
    snapshot = { state, ready: true, storageError };
    listeners.forEach((l) => l());
  };
  return {
    getSnapshot,
    getServerSnapshot: () => server,
    dispatch,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export type StudioController = Snapshot & {
  dispatch: (action: StudioAction) => void;
};
export function useStudioStore(enabled: boolean): StudioController {
  const [store] = useState(() => createStore(enabled));
  return {
    ...useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getServerSnapshot,
    ),
    dispatch: store.dispatch,
  };
}
