import path from "node:path";
import type { Server } from "node:http";
import { Verifier } from "@pact-foundation/pact";
import { afterAll, beforeAll, describe, it } from "vitest";
import app from "../../src/app";
import User from "../../src/models/User";

const PORT = 4001;

process.env.PACT_DO_NOT_TRACK = "true";

describe("Pact provider verification", () => {
  let server: Server;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(PORT, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("satisfies the TrelloJuniorWeb consumer contract", async () => {
    await new Verifier({
      provider: "TrelloJuniorApi",
      providerBaseUrl: `http://localhost:${PORT}`,
      pactUrls: [path.resolve(__dirname, "../../../web/pacts/TrelloJuniorWeb-TrelloJuniorApi.json")],
      // Sets up whatever precondition the consumer's "given(...)" declared, against
      // the real database, before that specific interaction gets replayed.
      stateHandlers: {
        "a user with email dup@example.com already exists": async () => {
          await User.create({ email: "dup@example.com", passwordHash: "irrelevant-hash", name: "Existing User" });
        },
      },
    }).verifyProvider();
  });
});
