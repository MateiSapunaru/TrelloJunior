import { useState, type ChangeEvent } from "react";
import * as cardsApi from "../api/cards";
import { ApiError } from "../api/client";
import type { Card, List } from "../types";

type Props = {
  boardId: string;
  listId: string;
  card: Card;
  otherLists: List[];
  onDeleted: () => void;
  onMoved: (toListId: string, card: Card) => void;
};

export function CardItem({ boardId, listId, card, otherLists, onDeleted, onMoved }: Props) {
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    try {
      await cardsApi.deleteCard(boardId, listId, card.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  // A "move to" dropdown instead of drag-and-drop: no drag library to justify, it's
  // keyboard-accessible, and Playwright driving a select is deterministic - drag
  // interactions are one of the flakier things to automate reliably.
  async function handleMove(e: ChangeEvent<HTMLSelectElement>) {
    const targetListId = e.target.value;
    if (!targetListId) {
      return;
    }
    setError(null);
    try {
      const updated = await cardsApi.moveCard(boardId, listId, card.id, targetListId);
      onMoved(targetListId, updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <li className="card-item" data-testid="card-item">
      <div className="card-item-row">
        <span>{card.title}</span>
        <button
          onClick={() => void handleDelete()}
          className="btn-icon"
          data-testid="delete-card-button"
          aria-label={`Delete card ${card.title}`}
        >
          ×
        </button>
      </div>
      {card.description && <p className="card-description">{card.description}</p>}
      {otherLists.length > 0 && (
        <select onChange={handleMove} value="" data-testid="move-card-select" aria-label={`Move card ${card.title}`}>
          <option value="" disabled>
            Move to…
          </option>
          {otherLists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.title}
            </option>
          ))}
        </select>
      )}
      {error && <p role="alert">{error}</p>}
    </li>
  );
}
