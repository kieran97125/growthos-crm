import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { start, getRun } from "workflow/api";
import { waitForSleep } from "@workflow/vitest";
import { deliveryWorkflow } from "../../src/workflows/delivery";
const state = vi.hoisted(() => ({
  ticks: 0,
  claims: 0,
  providerPosts: 0,
  active: true,
  mode: "sleep",
}));
describe("actual delivery orchestration", () => {
  beforeEach(() => {
    Object.assign(state, {
      ticks: 0,
      claims: 0,
      providerPosts: 0,
      active: true,
      mode: "sleep",
    });
    process.env.SMARTVOLT_SUPABASE_URL = "https://synthetic.example.invalid";
    process.env.SMARTVOLT_SUPABASE_PUBLISHABLE_KEY = "synthetic-public";
    process.env.SMARTVOLT_SUPABASE_SECRET_KEY = "synthetic-private";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("https://graph.facebook.com/"))
          state.providerPosts++;
        if (!url.startsWith("https://synthetic.example.invalid/rest/v1/"))
          throw Error("Unexpected network destination");
        if (url.includes("rpc/sv_delivery_scheduler")) {
          state.ticks++;
          return Response.json(
            state.active && state.ticks === 1
              ? {
                  active: true,
                  nextAt: new Date(Date.now() + 86400000).toISOString(),
                  jobs: state.mode === "sleep" ? [] : ["job"],
                }
              : { active: false, nextAt: null, jobs: [] },
          );
        }
        if (url.includes("rpc/sv_delivery_claim")) {
          state.claims++;
          return Response.json({ dispatch: false });
        }
        if (url.includes("/sv_delivery_schedulers?"))
          return Response.json({ generation: 1, token: "token" });
        if (url.includes("/sv_delivery_jobs?"))
          return Response.json({
            provider: "meta",
            connection_id: "connection",
            payload: { kind: "text" },
            state: "scheduled",
          });
        if (init?.method === "POST") state.providerPosts++;
        throw Error("Unexpected database request");
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  it("persists a future wait and resumes the same run when an earlier job wakes it", async () => {
    const run = await start(deliveryWorkflow, [
      "synthetic-company",
      1,
      "token",
    ]);
    const sleepId = await waitForSleep(run);
    expect(sleepId).toBeTruthy();
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });
    await run.returnValue;
    expect(state.ticks).toBe(2);
    expect(state.claims).toBe(0);
  });
  it("a cancelled or already admitted delivery does not enter the provider transport", async () => {
    state.mode = "claim";
    const run = await start(deliveryWorkflow, [
      "synthetic-company",
      1,
      "token",
    ]);
    await run.returnValue;
    expect(state.claims).toBe(1);
    expect(state.providerPosts).toBe(0);
  });
});
