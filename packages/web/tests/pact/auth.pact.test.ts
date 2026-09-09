import path from "node:path";
import { fileURLToPath } from "node:url";
import { MatchersV3, PactV3 } from "@pact-foundation/pact";
import { describe, expect, it, vi } from "vitest";
import * as authApi from "../../src/api/auth";
import { ApiError } from "../../src/api/client";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Consumer-driven contract: this test describes what the frontend (the consumer)
// expects from the API (the provider), and writes that expectation out as a pact
// file (packages/web/pacts/*.json). packages/api's provider verification test
// then replays these exact interactions against the real Express app to prove it
// actually satisfies them - so the contract is checked from both sides, not just
// asserted by the frontend in isolation.
const provider = new PactV3({
  consumer: "TrelloJuniorWeb",
  provider: "TrelloJuniorApi",
  dir: path.resolve(dirname, "../../pacts"),
});

describe("Auth API contract", () => {
  it("returns the created user on a successful signup", () => {
    provider
      .uponReceiving("a signup request with a new email")
      .withRequest({
        method: "POST",
        path: "/auth/signup",
        headers: { "Content-Type": "application/json" },
        body: { email: "new@example.com", password: "supersecret123", name: "New User" },
      })
      .willRespondWith({
        status: 201,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: {
          user: {
            id: MatchersV3.string("64f1a2b3c4d5e6f7a8b9c0d1"),
            email: MatchersV3.string("new@example.com"),
            name: MatchersV3.string("New User"),
          },
        },
      });

    return provider.executeTest(async (mockServer) => {
      vi.stubEnv("VITE_API_URL", mockServer.url);
      const res = await authApi.signup("new@example.com", "supersecret123", "New User");
      expect(res.user.email).toBe("new@example.com");
    });
  });

  // "given" declares a provider state: a precondition the provider's own
  // verification test is responsible for setting up (see packages/api's
  // stateHandlers) before replaying this interaction against the real app.
  it("rejects a signup with an email that's already registered", () => {
    provider
      .given("a user with email dup@example.com already exists")
      .uponReceiving("a signup request with a duplicate email")
      .withRequest({
        method: "POST",
        path: "/auth/signup",
        headers: { "Content-Type": "application/json" },
        body: { email: "dup@example.com", password: "supersecret123", name: "Someone Else" },
      })
      .willRespondWith({
        status: 409,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: { error: "email already in use" },
      });

    return provider.executeTest(async (mockServer) => {
      vi.stubEnv("VITE_API_URL", mockServer.url);
      const err = await authApi.signup("dup@example.com", "supersecret123", "Someone Else").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(409);
    });
  });

  it("rejects a login with the wrong credentials", () => {
    provider
      .uponReceiving("a login request with credentials that don't match any account")
      .withRequest({
        method: "POST",
        path: "/auth/login",
        headers: { "Content-Type": "application/json" },
        body: { email: "nobody@example.com", password: "whatever123" },
      })
      .willRespondWith({
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: { error: "invalid credentials" },
      });

    return provider.executeTest(async (mockServer) => {
      vi.stubEnv("VITE_API_URL", mockServer.url);
      const err = await authApi.login("nobody@example.com", "whatever123").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
    });
  });

  it("rejects a session check with no auth cookie", () => {
    provider
      .uponReceiving("a request for the current user with no session")
      .withRequest({
        method: "GET",
        path: "/auth/me",
      })
      .willRespondWith({
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: { error: "missing token" },
      });

    return provider.executeTest(async (mockServer) => {
      vi.stubEnv("VITE_API_URL", mockServer.url);
      const err = await authApi.fetchMe().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
    });
  });
});
