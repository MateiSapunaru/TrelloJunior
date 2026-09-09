import { MongoMemoryServer } from "mongodb-memory-server";

// Runs once for the whole test run, in a separate process from the test workers,
// before any test file starts. Starting one shared mongod here — instead of one per
// test file in tests/setup.ts's beforeAll — is what keeps the suite from spawning
// several real mongod binaries at once, which overloaded this machine and crashed
// with "fassert() failure" once the suite grew past a couple of files.
export default async function setup() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_MEMORY_SERVER_URI = mongod.getUri();

  return async () => {
    await mongod.stop();
  };
}
