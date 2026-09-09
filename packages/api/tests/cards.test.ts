import { beforeEach, describe, expect, it } from "vitest";
import { createBoard, createList, signup, type TestAgent } from "./helpers";

describe("Cards", () => {
  let owner: { agent: TestAgent; userId: string };
  let stranger: { agent: TestAgent; userId: string };
  let boardId: string;
  let todoListId: string;
  let doingListId: string;

  beforeEach(async () => {
    owner = await signup("owner@example.com", "Owner");
    stranger = await signup("stranger@example.com", "Stranger");
    boardId = await createBoard(owner.agent, "Sprint Board");
    todoListId = await createList(owner.agent, boardId, "To Do");
    doingListId = await createList(owner.agent, boardId, "Doing");
  });

  it("creates a card and lists it under its list", async () => {
    const createRes = await owner.agent
      .post(`/boards/${boardId}/lists/${todoListId}/cards`)
      .send({ title: "Write tests", description: "Cover the IDOR paths" });

    expect(createRes.status).toBe(201);
    expect(createRes.body.position).toBe(0);

    const listRes = await owner.agent.get(`/boards/${boardId}/lists/${todoListId}/cards`);
    expect(listRes.body).toHaveLength(1);
  });

  it("returns 404 for a stranger, even with a valid card id on someone else's board", async () => {
    const createRes = await owner.agent
      .post(`/boards/${boardId}/lists/${todoListId}/cards`)
      .send({ title: "Write tests" });
    const cardId = createRes.body.id;

    const res = await stranger.agent.get(`/boards/${boardId}/lists/${todoListId}/cards/${cardId}`);

    // loadBoard 404s the stranger before loadList or the card lookup ever runs —
    // a real card id on a real board is useless without board membership.
    expect(res.status).toBe(404);
  });

  it("moves a card to another list on the same board", async () => {
    const createRes = await owner.agent
      .post(`/boards/${boardId}/lists/${todoListId}/cards`)
      .send({ title: "Write tests" });
    const cardId = createRes.body.id;

    const moveRes = await owner.agent
      .patch(`/boards/${boardId}/lists/${todoListId}/cards/${cardId}`)
      .send({ listId: doingListId });

    expect(moveRes.status).toBe(200);
    expect(moveRes.body.listId).toBe(doingListId);
  });

  it("refuses to move a card into a list that belongs to a different board", async () => {
    const otherBoardId = await createBoard(owner.agent, "Other Board");
    const otherListId = await createList(owner.agent, otherBoardId, "Backlog");

    const createRes = await owner.agent
      .post(`/boards/${boardId}/lists/${todoListId}/cards`)
      .send({ title: "Write tests" });
    const cardId = createRes.body.id;

    const moveRes = await owner.agent
      .patch(`/boards/${boardId}/lists/${todoListId}/cards/${cardId}`)
      .send({ listId: otherListId });

    expect(moveRes.status).toBe(400);
  });

  it("deletes a card", async () => {
    const createRes = await owner.agent
      .post(`/boards/${boardId}/lists/${todoListId}/cards`)
      .send({ title: "Write tests" });
    const cardId = createRes.body.id;

    const deleteRes = await owner.agent.delete(`/boards/${boardId}/lists/${todoListId}/cards/${cardId}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await owner.agent.get(`/boards/${boardId}/lists/${todoListId}/cards`);
    expect(listRes.body).toHaveLength(0);
  });
});
