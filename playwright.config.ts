import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3037",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3037",
    url: "http://127.0.0.1:3037/crm/acceptance",
    reuseExistingServer: false,
    env: {
      CRM_ACCEPTANCE_FIXTURES: "true",
      CRM_WRITE_ENABLED: "false",
      NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      GROWTHOS_CRM_ADMIN_PASSWORD: "",
      LAUNCHHUB_ADMIN_PASSWORD: "",
    },
    timeout: 60_000,
  },
});
