import { useState, type FormEvent } from "react";
import * as cardsApi from "../api/cards";
import { ApiError } from "../api/client";
import * as listsApi from "../api/lists";
import type { Card, List } from "../types";
import { CardItem } from "./CardItem";

type Props = {
  boardId: string;
  list: List;
  cards: Card[];
  otherLists: List[];
  onCardCreated: (card: Card) => void;
  onCardDeleted: (cardId: string) => void;
  onCardMoved: (toListId: string, card: Card) => void;
  onListDeleted: () => void;
};

export function ListColumn({
  boardId,
  list,
  cards,
  otherLists,
  onCardCreated,
  onCardDeleted,
  onCardMoved,
  onListDeleted,
}: Props) {
  const [newCardTitle, setNewCardTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreateCard(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const card = await cardsApi.createCard(boardId, list.id, newCardTitle);
      onCardCreated(card);
      setNewCardTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function handleDeleteList() {
    setError(null);
    try {
      await listsApi.deleteList(boardId, list.id);
      onListDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <section className="list-column" data-testid="list-column">
      <div className="list-header">
        <h2>{list.title}</h2>
        <button
          onClick={() => void handleDeleteList()}
          data-testid="delete-list-button"
          aria-label={`Delete list ${list.title}`}
        >
          ×
        </button>
      </div>

      {error && <p role="alert">{error}</p>}

      <ul className="card-list" data-testid="card-list">
        {cards.map((card) => (
          <CardItem
            key={card.id}
            boardId={boardId}
            listId={list.id}
            card={card}
            otherLists={otherLists}
            onDeleted={() => onCardDeleted(card.id)}
            onMoved={onCardMoved}
          />
        ))}
      </ul>

      <form onSubmit={handleCreateCard} data-testid="create-card-form">
        <input
          value={newCardTitle}
          onChange={(e) => setNewCardTitle(e.target.value)}
          placeholder="New card title"
          data-testid="card-title-input"
          required
        />
        <button type="submit" data-testid="create-card-submit">
          Add card
        </button>
      </form>
    </section>
  );
}
