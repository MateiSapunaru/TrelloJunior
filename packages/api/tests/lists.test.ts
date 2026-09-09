import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import Card from "../src/models/Card";

async function signup(email: string, name: string) {
  const res = await request(app).post("/auth/signup").send({ email, password: "supersecret123", name });
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

async function createBoard(token: string, title: string) {
  const res = await request(app).post("/boards").set("Authorization", `Bearer ${token}`).send({ title });
  return res.body.id as string;
}

describe("Lists", () => {
  let owner: { token: string; userId: string };
  let collaborator: { token: string; userId: string };
  let stranger: { token: string; userId: string };
  let boardId: string;

  beforeEach(async () => {
    owner = await signup("owner@example.com", "Owner");
    collaborator = await signup("collab@example.com", "Collaborator");
    stranger = await signup("stranger@example.com", "Stranger");
    boardId = await createBoard(owner.token, "Sprint Board");

    await request(app)
      .post(`/boards/${boardId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ email: "collab@example.com" });
  });

  it("lets a collaborator (not just the owner) create and read lists", async () => {
    const createRes = await request(app)
      .post(`/boards/${boardId}/lists`)
      .set("Authorization", `Bearer ${collaborator.token}`)
      .send({ title: "To Do" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.position).toBe(0);

    const listRes = await request(app)
      .get(`/boards/${boardId}/lists`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(listRes.body).toHaveLength(1);
  });

  it("assigns increasing positions to new lists", async () => {
    await request(app).post(`/boards/${boardId}/lists`).set("Authorization", `Bearer ${owner.token}`).send({
      title: "To Do",
    });
    const secondRes = await request(app)
      .post(`/boards/${boardId}/lists`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Doing" });

    expect(secondRes.body.position).toBe(1);
  });

  it("returns 404 for a stranger with no access to the board", async () => {
    const res = await request(app)
      .post(`/boards/${boardId}/lists`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ title: "To Do" });

    expect(res.status).toBe(404);
  });

  it("deletes a list and cascades to its cards", async () => {
    const listRes = await request(app)
      .post(`/boards/${boardId}/lists`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "To Do" });
    const listId = listRes.body.id;

    await request(app)
      .post(`/boards/${boardId}/lists/${listId}/cards`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Write tests" });

    const deleteRes = await request(app)
      .delete(`/boards/${boardId}/lists/${listId}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(deleteRes.status).toBe(204);

    expect(await Card.countDocuments({ listId })).toBe(0);
  });
});
