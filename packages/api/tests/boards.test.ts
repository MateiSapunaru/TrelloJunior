import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";

async function signup(email: string, name: string) {
  const res = await request(app).post("/auth/signup").send({ email, password: "supersecret123", name });
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

describe("Board authorization", () => {
  let owner: { token: string; userId: string };
  let collaborator: { token: string; userId: string };
  let stranger: { token: string; userId: string };
  let boardId: string;

  beforeEach(async () => {
    owner = await signup("owner@example.com", "Owner");
    collaborator = await signup("collab@example.com", "Collaborator");
    stranger = await signup("stranger@example.com", "Stranger");

    const createRes = await request(app)
      .post("/boards")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Sprint Board" });
    boardId = createRes.body.id;
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/boards");
    expect(res.status).toBe(401);
  });

  it("lets the owner read and list their board", async () => {
    const getRes = await request(app).get(`/boards/${boardId}`).set("Authorization", `Bearer ${owner.token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.title).toBe("Sprint Board");

    const listRes = await request(app).get("/boards").set("Authorization", `Bearer ${owner.token}`);
    expect(listRes.body).toHaveLength(1);
  });

  it("returns 404, not 403, for a user with no relationship to the board (IDOR)", async () => {
    const res = await request(app).get(`/boards/${boardId}`).set("Authorization", `Bearer ${stranger.token}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for PATCH/DELETE attempts by a stranger too", async () => {
    const patchRes = await request(app)
      .patch(`/boards/${boardId}`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ title: "Hijacked" });
    const deleteRes = await request(app)
      .delete(`/boards/${boardId}`)
      .set("Authorization", `Bearer ${stranger.token}`);

    expect(patchRes.status).toBe(404);
    expect(deleteRes.status).toBe(404);
  });

  it("lets the owner add a collaborator, who can then read the board", async () => {
    const addRes = await request(app)
      .post(`/boards/${boardId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ email: "collab@example.com" });
    expect(addRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/boards/${boardId}`)
      .set("Authorization", `Bearer ${collaborator.token}`);
    expect(getRes.status).toBe(200);
  });

  it("lets a collaborator read but not edit or delete the board (403, since they can see it exists)", async () => {
    await request(app)
      .post(`/boards/${boardId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ email: "collab@example.com" });

    const patchRes = await request(app)
      .patch(`/boards/${boardId}`)
      .set("Authorization", `Bearer ${collaborator.token}`)
      .send({ title: "Renamed" });
    const deleteRes = await request(app)
      .delete(`/boards/${boardId}`)
      .set("Authorization", `Bearer ${collaborator.token}`);

    expect(patchRes.status).toBe(403);
    expect(deleteRes.status).toBe(403);
  });

  it("prevents a non-owner collaborator from adding new collaborators", async () => {
    await request(app)
      .post(`/boards/${boardId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ email: "collab@example.com" });

    const res = await request(app)
      .post(`/boards/${boardId}/collaborators`)
      .set("Authorization", `Bearer ${collaborator.token}`)
      .send({ email: "stranger@example.com" });

    expect(res.status).toBe(403);
  });

  it("deletes the board as owner, then 404s on subsequent access", async () => {
    const deleteRes = await request(app).delete(`/boards/${boardId}`).set("Authorization", `Bearer ${owner.token}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app).get(`/boards/${boardId}`).set("Authorization", `Bearer ${owner.token}`);
    expect(getRes.status).toBe(404);
  });
});
