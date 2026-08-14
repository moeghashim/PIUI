import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:31416",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "PIUI_PI_CLI=$PWD/test/fixtures/fake-pi.mjs node dist/server/cli.js --no-open --port 31416",
    url: "http://127.0.0.1:31416/api/bootstrap",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "narrow", use: { viewport: { width: 700, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
