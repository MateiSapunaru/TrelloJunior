import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../src/app";
import { signup, type TestAgent } from "../helpers";

const JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

describe("JWT tampering", () => {
  let owner: { agent: TestAgent; userId: string };

  beforeEach(async () => {
    owner = await signup("jwt-owner@example.com", "Owner");
  });

  it("rejects a request with no cookie at all", async () => {
    const res = await request(app).get("/boards");
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with the wrong secret (a forged token)", async () => {
    const forged = jwt.sign({ sub: owner.userId }, "not-the-real-secret", { expiresIn: "1h" });
    const res = await request(app).get("/boards").set("Cookie", `token=${forged}`);
    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const expired = jwt.sign({ sub: owner.userId }, JWT_SECRET, { expiresIn: -10 });
    const res = await request(app).get("/boards").set("Cookie", `token=${expired}`);
    expect(res.status).toBe(401);
  });

  it("rejects a token whose payload was altered after signing", async () => {
    const valid = jwt.sign({ sub: owner.userId }, JWT_SECRET, { expiresIn: "1h" });
    const [header, , signature] = valid.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: "000000000000000000000000" })).toString("base64url");
    const tampered = `${header}.${tamperedPayload}.${signature}`;

    const res = await request(app).get("/boards").set("Cookie", `token=${tampered}`);
    expect(res.status).toBe(401);
  });

  it("rejects a garbage token string that isn't a JWT at all", async () => {
    const res = await request(app).get("/boards").set("Cookie", "token=not-a-jwt-at-all");
    expect(res.status).toBe(401);
  });

  // Regression test for the bearer-token -> httpOnly-cookie migration: makes sure
  // there's no leftover fallback that would accept a token from a header instead
  // of the cookie, which would partly undo the point of moving to httpOnly cookies.
  it("ignores a valid token sent via Authorization header instead of the cookie", async () => {
    const valid = jwt.sign({ sub: owner.userId }, JWT_SECRET, { expiresIn: "1h" });
    const res = await request(app).get("/boards").set("Authorization", `Bearer ${valid}`);
    expect(res.status).toBe(401);
  });
});
