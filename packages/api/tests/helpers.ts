import request from "supertest";
import app from "../src/app";

// supertest's agent persists cookies across requests, the same way a browser session
// does — this is what lets a test authenticate once via signup/login and then reuse
// that session for subsequent requests, now that auth lives in an httpOnly cookie
// instead of a bearer token we could just re-attach manually per request.
export type TestAgent = ReturnType<typeof request.agent>;

export async function signup(email: string, name: string): Promise<{ agent: TestAgent; userId: string }> {
  const agent = request.agent(app);
  const res = await agent.post("/auth/signup").send({ email, password: "supersecret123", name });
  return { agent, userId: res.body.user.id as string };
}

export async function createBoard(agent: TestAgent, title: string): Promise<string> {
  const res = await agent.post("/boards").send({ title });
  return res.body.id as string;
}

export async function createList(agent: TestAgent, boardId: string, title: string): Promise<string> {
  const res = await agent.post(`/boards/${boardId}/lists`).send({ title });
  return res.body.id as string;
}
