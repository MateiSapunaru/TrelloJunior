import { defineConfig } from "vitest/config";

// Scoped to Pact contract tests only - this project deliberately has no
// component-testing suite (see README), so this config's job is narrow:
// run the consumer-side contract tests against a Pact mock provider.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/pact/**/*.pact.test.ts"],
    testTimeout: 30_000,
  },
});
