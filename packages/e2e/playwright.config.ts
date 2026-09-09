import { defineConfig, devices } from "@playwright/test";

// Overridable so this same config can point at an already-running instance
// (a docker-compose stack, or a deployed environment) instead of always
// spawning local dev servers - used when regenerating visual baselines against
// the containerized app via Playwright's official Docker image, and will be
// how CI points this at whatever it started for that job.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  expect: {
    // A small tolerance rather than a pixel-perfect match: anti-aliasing and
    // sub-pixel font rendering vary slightly run-to-run even with nothing
    // actually different on the page, and a 0% tolerance makes visual tests
    // flaky for reasons that have nothing to do with a real regression.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  // Two engines locally (Chromium + WebKit); Firefox's Windows build needs the
  // Microsoft Visual C++ Redistributable, not installed on this dev machine, and
  // that's a system-level install outside what a test config should assume. CI
  // (a clean Linux runner) re-adds it via PLAYWRIGHT_PROJECTS=all - see the
  // workflow. Also re-addable locally once the redistributable is installed.
  projects:
    process.env.PLAYWRIGHT_PROJECTS === "all"
      ? [
          { name: "chromium", use: { ...devices["Desktop Chrome"] } },
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : [
          { name: "chromium", use: { ...devices["Desktop Chrome"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ],
  // Starts the real API + web dev servers so tests exercise the actual app, not a
  // mock. Assumes MongoDB is already running (`npm run mongo:up` from the repo
  // root) - same prerequisite as running the app normally, not something a test
  // runner should be reaching into Docker to manage itself. Skipped entirely when
  // PLAYWRIGHT_BASE_URL points somewhere else - that server is already someone
  // else's responsibility to have running (docker-compose, a CI job, etc).
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
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
