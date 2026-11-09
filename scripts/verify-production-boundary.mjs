import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";

const base = "http://127.0.0.1:3038";
const secret = "synthetic-acceptance-secret-not-for-production-123456";
async function verify(gated) {
  let output = "";
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3038",
    ],
    {
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
        CRM_WRITE_ENABLED: "false",
        CRM_ACCEPTANCE_FIXTURES: "true",
        LAUNCHHUB_ADMIN_PASSWORD: "",
        LAUNCHHUB_ADMIN_SESSION_SECRET: "",
        GROWTHOS_CRM_ADMIN_PASSWORD: gated
          ? "synthetic-acceptance-password"
          : "",
        GROWTHOS_CRM_ADMIN_SESSION_SECRET: gated ? secret : "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const closed = new Promise((resolve) => child.once("close", resolve));
  child.stdout.on("data", (chunk) => {
    output = (output + chunk).slice(-4000);
  });
  child.stderr.on("data", (chunk) => {
    output = (output + chunk).slice(-4000);
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await fetch(`${base}/login`, { signal: AbortSignal.timeout(1000) });
        ready = true;
        break;
      } catch {
        await pause(250);
      }
      if (child.exitCode !== null) throw new Error(output);
    }
    assert.ok(ready, `Production server startup: ${output}`);
    if (gated) {
      const payload = Buffer.from(
        JSON.stringify({
          issuedAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        }),
      ).toString("base64url");
      const signature = createHmac("sha256", secret)
        .update(payload)
        .digest("base64url");
      const fixture = await fetch(`${base}/crm/acceptance`, {
        redirect: "manual",
        headers: {
          Cookie: `growthos_crm_admin_session=${payload}.${signature}`,
        },
      });
      assert.equal(
        fixture.status,
        404,
        "Synthetic fixture route must be unavailable in a production build, even when its test flag is true.",
      );
    }
    for (const route of [
      "/crm",
      "/crm/demo",
      "/crm/leads",
      "/crm/campaigns",
      "/crm/automations",
      "/crm/system",
      "/crm/acceptance",
    ]) {
      const response = await fetch(`${base}${route}`, { redirect: "manual" });
      assert.equal(
        response.status,
        307,
        `${route} must retain the configured authentication gate.`,
      );
      assert.equal(
        new URL(response.headers.get("location"), base).pathname,
        "/login",
      );
    }
  } finally {
    child.kill("SIGTERM");
    await closed;
  }
}
await verify(false);
await verify(true);
console.log(
  "Production fixture 404 and all seven protected CRM routes verified.",
);
