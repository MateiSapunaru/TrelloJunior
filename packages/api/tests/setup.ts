import mongoose from "mongoose";
import { afterEach, beforeAll } from "vitest";

process.env.JWT_SECRET ??= "test-secret";

// Multiple test files can share a worker process (and its mongoose singleton), so
// only connect if nothing has connected yet — a second beforeAll shouldn't reconnect.
beforeAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    return;
  }

  const uri = process.env.MONGO_MEMORY_SERVER_URI;
  if (!uri) {
    throw new Error("MONGO_MEMORY_SERVER_URI is not set — is tests/globalSetup.ts wired into vitest.config.mts?");
  }
  await mongoose.connect(uri);
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});
