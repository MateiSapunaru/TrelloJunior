import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import User from "../src/models/User";

describe("POST /auth/signup", () => {
  it("creates a user and returns a token", async () => {
    const res = await request(app).post("/auth/signup").send({
      email: "matei@example.com",
      password: "supersecret123",
      name: "Matei",
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: "matei@example.com", name: "Matei" });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects a duplicate email", async () => {
    await User.create({ email: "dup@example.com", passwordHash: "x", name: "Dup" });

    const res = await request(app).post("/auth/signup").send({
      email: "dup@example.com",
      password: "supersecret123",
      name: "Dup2",
    });

    expect(res.status).toBe(409);
  });

  it("rejects a password under the minimum length", async () => {
    const res = await request(app).post("/auth/signup").send({
      email: "short@example.com",
      password: "123",
      name: "Short",
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/auth/signup").send({
      email: "login@example.com",
      password: "correcthorse",
      name: "Login",
    });
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "login@example.com",
      password: "correcthorse",
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it("returns the same error for a wrong password and a nonexistent user", async () => {
    const wrongPassword = await request(app).post("/auth/login").send({
      email: "login@example.com",
      password: "wrongpassword",
    });
    const noSuchUser = await request(app).post("/auth/login").send({
      email: "nobody@example.com",
      password: "whatever123",
    });

    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(wrongPassword.body.error).toBe(noSuchUser.body.error);
  });
});
