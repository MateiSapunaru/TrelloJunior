import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { createBoard, signup, type TestAgent } from "./helpers";

describe("Board authorization", () => {
  let owner: { agent: TestAgent; userId: string };
  let collaborator: { agent: TestAgent; userId: string };
  let stranger: { agent: TestAgent; userId: string };
  let boardId: string;

  beforeEach(async () => {
    owner = await signup("owner@example.com", "Owner");
    collaborator = await signup("collab@example.com", "Collaborator");
    stranger = await signup("stranger@example.com", "Stranger");
    boardId = await createBoard(owner.agent, "Sprint Board");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/boards");
    expect(res.status).toBe(401);
  });

  it("lets the owner read and list their board", async () => {
    const getRes = await owner.agent.get(`/boards/${boardId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.title).toBe("Sprint Board");

    const listRes = await owner.agent.get("/boards");
    expect(listRes.body).toHaveLength(1);
  });

  it("returns 404, not 403, for a user with no relationship to the board (IDOR)", async () => {
    const res = await stranger.agent.get(`/boards/${boardId}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for PATCH/DELETE attempts by a stranger too", async () => {
    const patchRes = await stranger.agent.patch(`/boards/${boardId}`).send({ title: "Hijacked" });
    const deleteRes = await stranger.agent.delete(`/boards/${boardId}`);

    expect(patchRes.status).toBe(404);
    expect(deleteRes.status).toBe(404);
  });

  it("lets the owner add a collaborator, who can then read the board", async () => {
    const addRes = await owner.agent.post(`/boards/${boardId}/collaborators`).send({ email: "collab@example.com" });
    expect(addRes.status).toBe(200);

    const getRes = await collaborator.agent.get(`/boards/${boardId}`);
    expect(getRes.status).toBe(200);
  });

  it("lets a collaborator read but not edit or delete the board (403, since they can see it exists)", async () => {
    await owner.agent.post(`/boards/${boardId}/collaborators`).send({ email: "collab@example.com" });

    const patchRes = await collaborator.agent.patch(`/boards/${boardId}`).send({ title: "Renamed" });
    const deleteRes = await collaborator.agent.delete(`/boards/${boardId}`);

    expect(patchRes.status).toBe(403);
    expect(deleteRes.status).toBe(403);
  });

  it("prevents a non-owner collaborator from adding new collaborators", async () => {
    await owner.agent.post(`/boards/${boardId}/collaborators`).send({ email: "collab@example.com" });

    const res = await collaborator.agent
      .post(`/boards/${boardId}/collaborators`)
      .send({ email: "stranger@example.com" });

    expect(res.status).toBe(403);
  });

  it("deletes the board as owner, then 404s on subsequent access", async () => {
    const deleteRes = await owner.agent.delete(`/boards/${boardId}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await owner.agent.get(`/boards/${boardId}`);
    expect(getRes.status).toBe(404);
  });
});
