import type { Card } from "../types";
import { apiRequest } from "./client";

export function fetchCards(boardId: string, listId: string): Promise<Card[]> {
  return apiRequest(`/boards/${boardId}/lists/${listId}/cards`);
}

export function createCard(boardId: string, listId: string, title: string): Promise<Card> {
  return apiRequest(`/boards/${boardId}/lists/${listId}/cards`, { method: "POST", body: { title } });
}

export function moveCard(boardId: string, listId: string, cardId: string, targetListId: string): Promise<Card> {
  return apiRequest(`/boards/${boardId}/lists/${listId}/cards/${cardId}`, {
    method: "PATCH",
    body: { listId: targetListId },
  });
}

export function deleteCard(boardId: string, listId: string, cardId: string): Promise<void> {
  return apiRequest(`/boards/${boardId}/lists/${listId}/cards/${cardId}`, { method: "DELETE" });
}
