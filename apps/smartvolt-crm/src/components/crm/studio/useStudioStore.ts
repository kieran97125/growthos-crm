"use client";
import { useDemo } from "@/lib/demo/Provider";
import type { StudioAction, StudioState } from "./model";
export type StudioController = {
  state: StudioState;
  ready: boolean;
  storageError: boolean;
  dispatch: (action: StudioAction) => void;
};
export function useStudioStore(enabled: boolean): StudioController {
  void enabled;
  const d = useDemo();
  return {
    state: d.state.studio,
    ready: d.ready,
    storageError: d.storage.includes("未能"),
    dispatch: (action) => d.dispatch({ type: "studio", action }),
  };
}
