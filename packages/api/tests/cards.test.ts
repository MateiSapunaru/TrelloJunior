import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";

async function signup(email: string, name: string) {
  const res = await request(app).post("/auth/signup").send({ email, password: "supersecret123", name });
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

async function createBoard(token: string, title: string) {
  const res = await request(app).post("/boards").set("Authorization", `Bearer ${token}`).send({ title });
  return res.body.id as string;
}

async function createList(token: string, boardId: string, title: string) {
  const res = await request(app)
    .post(`/boards/${boardId}/lists`)
    .set("Authorization", `Bearer ${token}`)
    .send({ title });
  return res.body.id as string;
}

describe("Cards", () => {
  let owner: { token: string; userId: string };
  let stranger: { token: string; userId: string };
  let boardId: string;
  let todoListId: string;
  let doingListId: string;

  beforeEach(async () => {
    owner = await signup("owner@example.com", "Owner");
    stranger = await signup("stranger@example.com", "Stranger");
    boardId = await createBoard(owner.token, "Sprint Board");
    todoListId = await createList(owner.token, boardId, "To Do");
    doingListId = await createList(owner.token, boardId, "Doing");
  });

  it("creates a card and lists it under its list", async () => {
    const createRes = await request(app)
      .post(`/boards/${boardId}/lists/${todoListId}/cards`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Write tests", description: "Cover the IDOR paths" });

    expect(createRes.status).toBe(201);
    expect(createRes.body.position).toBe(0);

    const listRes = await request(app)
      .get(`/boards/${boardId}/lists/${todoListId}/cards`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(listRes.body).toHaveLength(1);
  });

  it("returns 404 for a stranger, even with a valid card id on someone else's board", async () => {
    const createRes = await request(app)
      .post(`/boards/${boardId}/lists/${todoListId}/cards`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Write tests" });
    const cardId = createRes.body.id;

    const res = await request(app)
      .get(`/boards/${boardId}/lists/${todoListId}/cards/${cardId}`)
      .set("Authorization", `Bearer ${stranger.token}`);

    // loadBoard 404s the stranger before loadList or the card lookup ever runs —
    // a real card id on a real board is useless without board membership.
    expect(res.status).toBe(404);
  });

  it("moves a card to another list on the same board", async () => {
    const createRes = await request(app)
      .post(`/boards/${boardId}/lists/${todoListId}/cards`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Write tests" });
    const cardId = createRes.body.id;

    const moveRes = await request(app)
      .patch(`/boards/${boardId}/lists/${todoListId}/cards/${cardId}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ listId: doingListId });

    expect(moveRes.status).toBe(200);
    expect(moveRes.body.listId).toBe(doingListId);
  });

  it("refuses to move a card into a list that belongs to a different board", async () => {
    const otherBoardId = await createBoard(owner.token, "Other Board");
    const otherListId = await createList(owner.token, otherBoardId, "Backlog");

    const createRes = await request(app)
      .post(`/boards/${boardId}/lists/${todoListId}/cards`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Write tests" });
    const cardId = createRes.body.id;

    const moveRes = await request(app)
      .patch(`/boards/${boardId}/lists/${todoListId}/cards/${cardId}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ listId: otherListId });

    expect(moveRes.status).toBe(400);
  });

  it("deletes a card", async () => {
    const createRes = await request(app)
      .post(`/boards/${boardId}/lists/${todoListId}/cards`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Write tests" });
    const cardId = createRes.body.id;

    const deleteRes = await request(app)
      .delete(`/boards/${boardId}/lists/${todoListId}/cards/${cardId}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get(`/boards/${boardId}/lists/${todoListId}/cards`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(listRes.body).toHaveLength(0);
  });
});
