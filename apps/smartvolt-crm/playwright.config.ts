import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/initial-paint.spec.ts",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3042",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3042",
    url: "http://127.0.0.1:3042",
    reuseExistingServer: false,
    env: {
      SMARTVOLT_APP_URL: "http://127.0.0.1:3042",
      SMARTVOLT_SUPABASE_URL: "",
      SMARTVOLT_SUPABASE_PUBLISHABLE_KEY: "",
      SMARTVOLT_SUPABASE_SECRET_KEY: "",
      SMARTVOLT_WHATSAPP_ENCRYPTION_KEY: "",
      SMARTVOLT_WHATSAPP_GRAPH_VERSION: "",
      AI_GATEWAY_MODEL: "",
      AI_GATEWAY_API_KEY: "",
      VERCEL_OIDC_TOKEN: "",
      DEMO_ACCESS_CODE: "",
    },
    timeout: 90000,
  },
});
