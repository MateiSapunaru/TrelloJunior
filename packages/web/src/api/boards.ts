import type { Board } from "../types";
import { apiRequest } from "./client";

export function fetchBoards(): Promise<Board[]> {
  return apiRequest("/boards");
}

export function createBoard(title: string): Promise<Board> {
  return apiRequest("/boards", { method: "POST", body: { title } });
}
