"use client";
import { useDemo } from "@/lib/demo/Provider";
import type { Action } from "./model";
export function useDemoWorkspace(enabled: boolean, initialNow?: number) {
  void enabled;
  void initialNow;
  const d = useDemo();
  return {
    state: d.state.inbox,
    ready: d.ready,
    now: d.now,
    storage: d.storage,
    dispatch: (action: Action) =>
      action.type === "reset"
        ? d.dispatch({ type: "reset", at: Date.now() })
        : d.dispatch({ type: "inbox", action }),
  };
}
