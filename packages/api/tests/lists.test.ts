import { beforeEach, describe, expect, it } from "vitest";
import Card from "../src/models/Card";
import { createBoard, signup, type TestAgent } from "./helpers";

describe("Lists", () => {
  let owner: { agent: TestAgent; userId: string };
  let collaborator: { agent: TestAgent; userId: string };
  let stranger: { agent: TestAgent; userId: string };
  let boardId: string;

  beforeEach(async () => {
    owner = await signup("owner@example.com", "Owner");
    collaborator = await signup("collab@example.com", "Collaborator");
    stranger = await signup("stranger@example.com", "Stranger");
    boardId = await createBoard(owner.agent, "Sprint Board");

    await owner.agent.post(`/boards/${boardId}/collaborators`).send({ email: "collab@example.com" });
  });

  it("lets a collaborator (not just the owner) create and read lists", async () => {
    const createRes = await collaborator.agent.post(`/boards/${boardId}/lists`).send({ title: "To Do" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.position).toBe(0);

    const listRes = await owner.agent.get(`/boards/${boardId}/lists`);
    expect(listRes.body).toHaveLength(1);
  });

  it("assigns increasing positions to new lists", async () => {
    await owner.agent.post(`/boards/${boardId}/lists`).send({ title: "To Do" });
    const secondRes = await owner.agent.post(`/boards/${boardId}/lists`).send({ title: "Doing" });

    expect(secondRes.body.position).toBe(1);
  });

  it("returns 404 for a stranger with no access to the board", async () => {
    const res = await stranger.agent.post(`/boards/${boardId}/lists`).send({ title: "To Do" });
    expect(res.status).toBe(404);
  });

  it("deletes a list and cascades to its cards", async () => {
    const listRes = await owner.agent.post(`/boards/${boardId}/lists`).send({ title: "To Do" });
    const listId = listRes.body.id;

    await owner.agent.post(`/boards/${boardId}/lists/${listId}/cards`).send({ title: "Write tests" });

    const deleteRes = await owner.agent.delete(`/boards/${boardId}/lists/${listId}`);
    expect(deleteRes.status).toBe(204);

    expect(await Card.countDocuments({ listId })).toBe(0);
  });
});
