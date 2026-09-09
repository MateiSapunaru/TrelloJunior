import { beforeEach, describe, expect, it } from "vitest";
import { createBoard, createList, signup, type TestAgent } from "../helpers";

type Method = "get" | "post" | "patch" | "delete";

function sendAs(agent: TestAgent, method: Method, path: string) {
  return agent[method](path).send({});
}

// A systematic sweep, not a duplicate of the authorization checks already inline
// in boards/lists/cards.test.ts (those prove each endpoint behaves correctly as
// part of testing its normal CRUD behavior). This file's job is different: prove
// that *every* board-scoped route enforces the same rule, by enumerating them all
// in one table instead of trusting that each one was remembered individually.
describe("IDOR: cross-user access to boards/lists/cards", () => {
  let owner: { agent: TestAgent; userId: string };
  let stranger: { agent: TestAgent; userId: string };
  let boardId: string;
  let listId: string;
  let cardId: string;

  beforeEach(async () => {
    owner = await signup("idor-owner@example.com", "Owner");
    stranger = await signup("idor-stranger@example.com", "Stranger");
    boardId = await createBoard(owner.agent, "Owner's Board");
    listId = await createList(owner.agent, boardId, "Owner's List");
    const cardRes = await owner.agent
      .post(`/boards/${boardId}/lists/${listId}/cards`)
      .send({ title: "Owner's Card" });
    cardId = cardRes.body.id as string;
  });

  const routes: Array<[string, Method, () => string]> = [
    ["get a board", "get", () => `/boards/${boardId}`],
    ["rename a board", "patch", () => `/boards/${boardId}`],
    ["delete a board", "delete", () => `/boards/${boardId}`],
    ["add a collaborator", "post", () => `/boards/${boardId}/collaborators`],
    ["list a board's lists", "get", () => `/boards/${boardId}/lists`],
    ["create a list", "post", () => `/boards/${boardId}/lists`],
    ["rename a list", "patch", () => `/boards/${boardId}/lists/${listId}`],
    ["delete a list", "delete", () => `/boards/${boardId}/lists/${listId}`],
    ["list a list's cards", "get", () => `/boards/${boardId}/lists/${listId}/cards`],
    ["create a card", "post", () => `/boards/${boardId}/lists/${listId}/cards`],
    ["get a card", "get", () => `/boards/${boardId}/lists/${listId}/cards/${cardId}`],
    ["edit a card", "patch", () => `/boards/${boardId}/lists/${listId}/cards/${cardId}`],
    ["delete a card", "delete", () => `/boards/${boardId}/lists/${listId}/cards/${cardId}`],
  ];

  it.each(routes)("%s (%s) returns 404 for a user with no relationship to the board", async (_label, method, pathFn) => {
    const res = await sendAs(stranger.agent, method, pathFn());
    expect(res.status).toBe(404);
  });

  it("returns 404, not a 500, for a malformed board id (not a valid ObjectId)", async () => {
    const res = await stranger.agent.get("/boards/not-a-valid-object-id");
    expect(res.status).toBe(404);
  });

  it("returns 403, not 404, for a collaborator without owner-only permission — contrast with the sweep above", async () => {
    const collaborator = await signup("idor-collaborator@example.com", "Collaborator");
    await owner.agent.post(`/boards/${boardId}/collaborators`).send({ email: "idor-collaborator@example.com" });

    const res = await collaborator.agent.patch(`/boards/${boardId}`).send({ title: "Hijacked" });
    expect(res.status).toBe(403);
  });
});
