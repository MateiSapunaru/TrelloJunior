import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  // Two engines: Chromium (Blink) and WebKit. Firefox is deliberately left out
  // here - its Windows build needs the Microsoft Visual C++ Redistributable
  // (x64), which this dev machine doesn't have installed, and that's a
  // system-level install outside what a test config should assume. Re-add
  // { name: "firefox", use: { ...devices["Desktop Firefox"] } } once that's
  // installed, or in CI (a clean Linux runner, where this isn't an issue).
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  // Starts the real API + web dev servers so tests exercise the actual app, not a
  // mock. Assumes MongoDB is already running (`npm run mongo:up` from the repo
  // root) - same prerequisite as running the app normally, not something a test
  // runner should be reaching into Docker to manage itself.
  webServer: [
    {
      command: "npm run dev -w packages/api",
      cwd: "../../",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "npm run dev -w packages/web",
      cwd: "../../",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
