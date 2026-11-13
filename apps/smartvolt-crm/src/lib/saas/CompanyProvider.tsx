"use client";
import { useWorkspaceChrome } from "@/components/workspace/context";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { createContext, useContext, useState, type ReactNode } from "react";
import { WorkspaceContext, useDemo, type Snapshot } from "@/lib/demo/Provider";
import {
  appReducer,
  appSchema,
  type AppAction,
  type AppState,
} from "@/lib/demo/state";
import { BRANDS, TEAM } from "@/components/crm/conversations/model";
import { applyCompanyCommand } from "./workspace";
import {
  projectWorkspace,
  requireCommandProduct,
  type Product,
} from "./products";
import type { Actor, CompanyScope } from "./identity";

type Identity = {
  scope: CompanyScope;
  actor: Actor;
  connected: boolean;
  products: Product[];
};
const IdentityContext = createContext<Identity | null>(null);
export function useIdentity(): Identity {
  return (
    useContext(IdentityContext) ?? {
      connected: false,
      products: [],
      scope: {
        companyId: "followhub-demo-only",
        companyName: "Nova Group",
        brands: BRANDS,
        team: [...TEAM],
      },
      actor: { id: "me", name: "Mia", role: "owner" },
    }
  );
}
export function PreviewIdentity({
  children,
  scope,
  products,
}: {
  children: ReactNode;
  scope: CompanyScope;
  products: Product[];
}) {
  return (
    <IdentityContext.Provider
      value={{
        scope,
        products,
        actor: { id: "me", name: "Mia", role: "owner" },
        connected: false,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

function createCompanyStore(
  initial: AppState,
  revision: number,
  actor: Actor,
  products: Product[],
) {
  let saved = initial,
    currentRevision = revision;
  let snapshot: Snapshot = {
    state: initial,
    ready: true,
    now: Date.now(),
    storage: "已儲存至公司工作空間",
  };
  const server = snapshot;
  const listeners = new Set<() => void>();
  const queue: { id: string; action: AppAction }[] = [];
  let running = false,
    blocked = false;
  const emit = () => listeners.forEach((fn) => fn());
  const drain = async () => {
    if (running || blocked || !queue.length) return;
    running = true;
    const pending = queue[0];
    try {
      const response = await fetch(
        `/api/companies/${initial.scope!.companyId}/workspace`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: currentRevision,
            commandId: pending.id,
            command: pending.action,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw Error(body.error ?? "未能儲存，請稍後重試。");
      saved = appSchema.parse(body.state);
      currentRevision = body.revision;
      queue.shift();
      window.dispatchEvent(new Event("convelta:data-changed"));
      snapshot = {
        ...snapshot,
        state: projectWorkspace(
          queue.reduce((s, p) => appReducer(s, p.action, actor.name), saved),
          products,
        ),
        storage: queue.length ? "正在儲存改動…" : "已儲存至公司工作空間",
        now: Date.now(),
      };
    } catch (error) {
      blocked = true;
      // Keep the pending command in memory. Never silently retry against a newer revision.
      snapshot = {
        ...snapshot,
        storage: `${error instanceof Error ? error.message : "未能儲存。"} 尚有未儲存改動，請保留此頁。`,
      };
    } finally {
      running = false;
      emit();
      if (!blocked) void drain();
    }
  };
  return {
    get: () => snapshot,
    getServer: () => server,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    dispatch(action: AppAction) {
      if (blocked) {
        emit();
        return;
      }
      try {
        requireCommandProduct(products, action);
        const next = applyCompanyCommand(
          snapshot.state,
          action,
          actor,
          Date.now(),
          products,
        );
        queue.push({ id: crypto.randomUUID(), action });
        snapshot = {
          ...snapshot,
          state: projectWorkspace(next, products),
          storage: "正在儲存改動…",
          now: Date.now(),
        };
        emit();
        void drain();
      } catch (error) {
        snapshot = {
          ...snapshot,
          storage: error instanceof Error ? error.message : "改動未通過驗證。",
        };
        emit();
      }
    },
    exportPending() {
      const file = new Blob(
        [
          JSON.stringify(
            {
              companyId: initial.scope!.companyId,
              revision: currentRevision,
              commands: queue,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const link = document.createElement("a"),
        url = URL.createObjectURL(file);
      link.href = url;
      link.download = BRAND.unsavedFilename;
      link.click();
      URL.revokeObjectURL(url);
    },
    retry() {
      blocked = false;
      void drain();
    },
  };
}
function SaveStatus({
  onRetry,
  onExport,
}: {
  onRetry: () => void;
  onExport: () => void;
}) {
  const chrome = useWorkspaceChrome();
  const { storage } = useDemo();
  const error = /未能|未有|未儲存|未通過|需要|尚未|無權|請|證據/.test(storage);
  if (chrome && !error && storage === "已儲存至公司工作空間") return null;
  return (
    <div
      className={`sv-save-status ${error ? "is-error" : ""}`}
      role="status"
      aria-live="polite"
    >
      {storage}
      {chrome && error && (
        <>
          <button onClick={onRetry}>重試儲存</button>
          <button onClick={onExport}>匯出未儲存改動</button>
        </>
      )}
    </div>
  );
}
export function CompanyProvider({
  state,
  revision,
  actor,
  products,
  children,
}: {
  state: AppState;
  revision: number;
  actor: Actor;
  products: Product[];
  children: ReactNode;
}) {
  const chrome = useWorkspaceChrome();
  const [store] = useState(() =>
    createCompanyStore(state, revision, actor, products),
  );
  return (
    <IdentityContext.Provider
      value={{ scope: state.scope!, actor, products, connected: true }}
    >
      <WorkspaceContext.Provider value={store}>
        <div className="sv-company-shell">
          {!chrome && (
            <div className="sv-company-toolbar">
              <span>{state.scope!.companyName}</span>
              <Link href="/">切換公司</Link>
              {products.includes("crm") && (
                <Link href={`/company/${state.scope!.companyId}/crm/whatsapp`}>
                  WhatsApp 收件匣
                </Link>
              )}
              <Link href={`/company/${state.scope!.companyId}/settings`}>
                公司設定
              </Link>
              <button onClick={store.retry}>重試儲存</button>
              <button onClick={store.exportPending}>匯出未儲存改動</button>
              <form action="/auth/signout" method="post">
                <button>登出</button>
              </form>
            </div>
          )}
          {children}
          <SaveStatus onRetry={store.retry} onExport={store.exportPending} />
        </div>
      </WorkspaceContext.Provider>
    </IdentityContext.Provider>
  );
}
