import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "admin-mfa.spec.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: "http://127.0.0.1:3142",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3142",
    url: "http://127.0.0.1:3142/login",
    timeout: 120_000,
    env: {
      SMARTVOLT_APP_URL: "https://convelta.example.invalid",
      SMARTVOLT_SUPABASE_URL: "http://127.0.0.1:3143",
      SMARTVOLT_SUPABASE_SECRET_KEY: "synthetic-local-service-role-key",
      SMARTVOLT_SUPABASE_PUBLISHABLE_KEY: "synthetic-local-public-key",
    },
  },
});
