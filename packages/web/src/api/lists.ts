import type { List } from "../types";
import { apiRequest } from "./client";

export function fetchLists(boardId: string): Promise<List[]> {
  return apiRequest(`/boards/${boardId}/lists`);
}

export function createList(boardId: string, title: string): Promise<List> {
  return apiRequest(`/boards/${boardId}/lists`, { method: "POST", body: { title } });
}

export function deleteList(boardId: string, listId: string): Promise<void> {
  return apiRequest(`/boards/${boardId}/lists/${listId}`, { method: "DELETE" });
}
