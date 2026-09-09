import { defineConfig } from "vitest/config";

// Separate from vitest.config.mts because Pact's Verifier makes real HTTP
// requests against the provider - it needs an actual listening server, unlike
// the main suite, which imports the Express app in-process via Supertest and
// never binds a port. Reuses the same shared-mongod globalSetup/setup pattern.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    globalSetup: ["./tests/globalSetup.ts"],
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/pact/**/*.pact.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
