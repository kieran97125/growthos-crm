import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { build } from "esbuild";
import { AccessError } from "../src/lib/saas/identity";
import { aiErrors } from "../src/lib/ai/errors";
import {
  CoachingError,
  coachingReceipt,
  terminalCoachingFailure,
} from "../src/lib/coaching/receipt";

test("persisted model failures release the failed command for a new explicit analysis", () => {
  for (const code of [
    "rate_limited",
    "unavailable",
    "answer_verification_failed",
  ]) {
    let failure: unknown;
    try {
      coachingReceipt({ dispatch: false, status: "failed", error_code: code });
    } catch (e) {
      failure = e;
    }
    assert.ok(failure instanceof CoachingError);
    assert.deepEqual(terminalCoachingFailure(failure), {
      status: 503,
      body: { error: failure.message, terminalFailure: true, code },
    });
  }
});

test("persisted interrupted or invalidated context is terminal without reusing its request ID", () => {
  for (const code of [
    "context_changed",
    "source_changed",
    "interrupted",
    "disabled",
  ]) {
    assert.throws(
      () => coachingReceipt({ status: "failed", error_code: code }),
      (e) => {
        const response = terminalCoachingFailure(e);
        assert.equal(response?.status, 409);
        assert.equal(response?.body.code, code);
        return response?.body.terminalFailure === true;
      },
    );
  }
});

test("ambiguous transport and malformed receipts never claim a terminal model outcome", () => {
  for (const e of [
    new Error("fetch failed"),
    new AccessError("RPC response unknown", 503),
  ])
    assert.equal(terminalCoachingFailure(e), null);
  for (const row of [
    null,
    {},
    { status: "unknown" },
    { status: "completed", result: null },
    { status: "failed", error_code: 503 },
  ]) {
    assert.throws(
      () => coachingReceipt(row),
      (e) => {
        assert.equal(terminalCoachingFailure(e), null);
        return e instanceof AccessError && e.status === 503;
      },
    );
  }
});

test("running and completed receipts preserve normal idempotent recovery", () => {
  assert.deepEqual(coachingReceipt({ status: "running", error_code: null }), {
    state: "running",
  });
  const analysis = { id: "stored-analysis", stale: true };
  assert.deepEqual(coachingReceipt({ status: "completed", result: analysis }), {
    analysis,
  });
});

test("the POST route signals persisted failures but keeps transport failures uncertain", async () => {
  const stubs: Record<string, string> = {
    "@/lib/coaching/server": `import {coachingReceipt} from ${JSON.stringify(resolve("src/lib/coaching/receipt.ts"))};export const readCoaching=async()=>({});export const actCoaching=async(_company,body)=>{if(body.transport)throw new Error('unknown transport outcome');return coachingReceipt(body.receipt);};`,
    "@/lib/saas/http":
      "export const json=(body,status=200)=>Response.json(body,{status});export const failure=(error)=>Response.json({error:error.message},{status:error.status??503});export const sameOrigin=()=>{};",
    "@/lib/whatsapp/http":
      "export const boundedJson=(request)=>request.json();",
  };
  const output = await build({
    entryPoints: ["src/app/api/companies/[companyId]/coaching/route.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "isolated-coaching-route",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            args.path in stubs
              ? { path: args.path, namespace: "coaching-route-test" }
              : undefined,
          );
          b.onLoad(
            { filter: /.*/, namespace: "coaching-route-test" },
            (args) => ({
              contents: stubs[args.path],
              loader: "js",
              resolveDir: process.cwd(),
            }),
          );
        },
      },
    ],
  });
  const route = await import(
    "data:text/javascript;base64," +
      Buffer.from(output.outputFiles[0].text).toString("base64")
  );
  const post = (body: unknown) =>
    route.POST(
      new Request("https://app.example.invalid/api/coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      {
        params: Promise.resolve({
          companyId: "11111111-1111-4111-8111-111111111111",
        }),
      },
    ) as Promise<Response>;
  const terminal = await post({
    receipt: { status: "failed", error_code: "rate_limited" },
  });
  assert.equal(terminal.status, 503);
  assert.deepEqual(await terminal.json(), {
    error: aiErrors.rate_limited,
    terminalFailure: true,
    code: "rate_limited",
  });
  for (const body of [
    { transport: true },
    { receipt: { status: "completed", result: null } },
  ]) {
    const uncertain = await post(body);
    assert.equal(uncertain.status, 503);
    assert.equal((await uncertain.json()).terminalFailure, undefined);
  }
  const running = await post({ receipt: { status: "running" } });
  assert.equal(running.status, 202);
  assert.deepEqual(await running.json(), { state: "running" });
});
