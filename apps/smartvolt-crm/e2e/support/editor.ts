import type { Route } from "@playwright/test";
import { editorAction } from "../../src/lib/operations/editor";
export function createEditorFixture() {
  const leases = new Map<
    string,
    { token: string; revision: number; expires: number }
  >();
  return async (route: Route) => {
    const b = editorAction.parse(route.request().postDataJSON()),
      key = b.provider + ":" + b.threadId;
    let e = leases.get(key),
      live = !!e && e.expires > Date.now();
    if (
      b.mode === "takeover" &&
      b.revision !== (e?.revision ?? 0) &&
      !(live && e?.token === b.token)
    ) {
      await route.fulfill({
        status: 409,
        json: { error: "另一位同事已接手，草稿會保留。" },
      });
      return;
    }
    if ((b.mode === "acquire" && !live) || b.mode === "takeover") {
      e = {
        token: b.token,
        revision: (e?.revision ?? 0) + 1,
        expires: Date.now() + 45000,
      };
      leases.set(key, e);
      live = true;
    } else if (b.mode === "release" && e?.token === b.token) {
      e.expires = 0;
      live = false;
    } else if (b.mode === "heartbeat" && live && e?.token === b.token)
      e.expires = Date.now() + 45000;
    await route.fulfill({
      json: {
        held: live && e?.token === b.token,
        occupied: live,
        actorName: live ? "Synthetic colleague" : null,
        revision: e?.revision ?? 0,
        expiresAt: e ? new Date(e.expires).toISOString() : null,
      },
    });
  };
}
