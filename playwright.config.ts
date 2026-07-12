import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: "http://127.0.0.1:4173", storageState: "tests/e2e/.auth/guest.json", trace: "retain-on-failure", launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : undefined },
  webServer: [
    { command: "pnpm --filter @daily/api dev", url: "http://127.0.0.1:8787/v1/rankings/2026-07-11?hintMode=off", reuseExistingServer: false, env: { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "", AUTH_PEPPER: "test-pepper", PORT: "8787" } },
    { command: "pnpm --filter @daily/web dev --host 127.0.0.1 --port 4173", url: "http://127.0.0.1:4173/today", reuseExistingServer: false },
    { command: "pnpm --filter @daily/publisher dev --host 127.0.0.1 --port 4174", url: "http://127.0.0.1:4174", reuseExistingServer: false }
  ]
});
