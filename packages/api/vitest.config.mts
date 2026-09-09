import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    globalSetup: ["./tests/globalSetup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Pact provider verification (tests/pact/) has its own config (vitest.pact.config.mts,
    // run via `npm run test:pact`) since it needs a real listening server, unlike this
    // suite. Vitest's default include glob would otherwise also pick up *.pact.test.ts
    // here, running it twice under different (and for this config, wrong) assumptions.
    // Extends (not replaces) Vitest's own default exclude list.
    exclude: [...configDefaults.exclude, "tests/pact/**"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // All test files share one mongod instance and database (see globalSetup.ts). Running
    // files concurrently would let one file's afterEach collection-wipe race against
    // another file's in-progress test. At this suite's size the sequential cost is small;
    // per-file databases would be the fix if this suite grows large enough for that to matter.
    fileParallelism: false,
  },
});
