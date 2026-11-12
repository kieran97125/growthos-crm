import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
const server = Array.isArray(base.webServer)
  ? base.webServer[0]
  : base.webServer;

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/initial-paint.spec.ts",
  outputDir: "paint-test-results",
  webServer: {
    ...server,
    command: "npm run start -- --hostname 127.0.0.1 --port 3043",
    url: "http://127.0.0.1:3043",
    reuseExistingServer: false,
    env: { ...server?.env, SMARTVOLT_APP_URL: "http://127.0.0.1:3043" },
  },
  use: { ...base.use, baseURL: "http://127.0.0.1:3043" },
});
