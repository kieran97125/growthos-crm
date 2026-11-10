import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3038",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3038",
    url: "http://127.0.0.1:3038",
    reuseExistingServer: false,
    env: {
      AI_GATEWAY_MODEL: "",
      AI_GATEWAY_API_KEY: "",
      VERCEL_OIDC_TOKEN: "",
      DEMO_ACCESS_CODE: "",
    },
    timeout: 90000,
  },
});
