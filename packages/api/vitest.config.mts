import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    globalSetup: ["./tests/globalSetup.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // All test files share one mongod instance and database (see globalSetup.ts). Running
    // files concurrently would let one file's afterEach collection-wipe race against
    // another file's in-progress test. At this suite's size the sequential cost is small;
    // per-file databases would be the fix if this suite grows large enough for that to matter.
    fileParallelism: false,
  },
});
