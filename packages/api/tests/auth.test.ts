import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import User from "../src/models/User";

describe("POST /auth/signup", () => {
  it("creates a user and sets an auth cookie that /auth/me accepts", async () => {
    const agent = request.agent(app);
    const signupRes = await agent.post("/auth/signup").send({
      email: "matei@example.com",
      password: "supersecret123",
      name: "Matei",
    });

    expect(signupRes.status).toBe(201);
    expect(signupRes.body.user).toMatchObject({ email: "matei@example.com", name: "Matei" });
    expect(signupRes.body.token).toBeUndefined();
    expect(signupRes.body.user.passwordHash).toBeUndefined();

    const meRes = await agent.get("/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.user).toMatchObject({ email: "matei@example.com" });
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

  it("logs in, and the resulting cookie authenticates subsequent requests", async () => {
    const agent = request.agent(app);
    const loginRes = await agent.post("/auth/login").send({
      email: "login@example.com",
      password: "correcthorse",
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeUndefined();

    const meRes = await agent.get("/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe("login@example.com");
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

describe("GET /auth/me", () => {
  it("returns 401 when there is no auth cookie", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("clears the auth cookie so /auth/me stops working afterward", async () => {
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({
      email: "logout@example.com",
      password: "supersecret123",
      name: "Logout",
    });
    expect((await agent.get("/auth/me")).status).toBe(200);

    const logoutRes = await agent.post("/auth/logout");
    expect(logoutRes.status).toBe(204);

    const meRes = await agent.get("/auth/me");
    expect(meRes.status).toBe(401);
  });
});
