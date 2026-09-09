import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../src/app";
import { signup } from "../helpers";

describe("Login rate limiting", () => {
  it("blocks further login attempts against one account after 10 in the current window", async () => {
    await signup("ratelimit-user@example.com", "Rate Limited");

    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/auth/login")
        .send({ email: "ratelimit-user@example.com", password: "wrongpassword" });
      expect(res.status).toBe(401);
    }

    const blocked = await request(app)
      .post("/auth/login")
      .send({ email: "ratelimit-user@example.com", password: "wrongpassword" });
    expect(blocked.status).toBe(429);
  });

  it("rate-limits per targeted account, not globally — a different email is unaffected", async () => {
    await signup("ratelimit-victim@example.com", "Victim");
    await signup("ratelimit-bystander@example.com", "Bystander");

    for (let i = 0; i < 11; i++) {
      await request(app)
        .post("/auth/login")
        .send({ email: "ratelimit-victim@example.com", password: "wrongpassword" });
    }

    const bystanderAttempt = await request(app)
      .post("/auth/login")
      .send({ email: "ratelimit-bystander@example.com", password: "wrongpassword" });
    expect(bystanderAttempt.status).toBe(401);
  });

  it("does not rate-limit signup — only login is brute-forceable in a way that matters", async () => {
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post("/auth/signup")
        .send({ email: `scoped-${i}@example.com`, password: "supersecret123", name: "Scoped" });
      expect(res.status).toBe(201);
    }
  });
});
