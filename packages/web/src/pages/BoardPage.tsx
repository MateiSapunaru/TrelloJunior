import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import * as boardsApi from "../api/boards";
import * as cardsApi from "../api/cards";
import { ApiError } from "../api/client";
import * as listsApi from "../api/lists";
import { ListColumn } from "../components/ListColumn";
import type { Board, Card, List } from "../types";

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [board, setBoard] = useState<Board | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [cardsByListId, setCardsByListId] = useState<Record<string, Card[]>>({});
  const [newListTitle, setNewListTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!boardId) {
      return;
    }
    let cancelled = false;

    async function load(id: string) {
      try {
        const [boardRes, listsRes] = await Promise.all([boardsApi.fetchBoard(id), listsApi.fetchLists(id)]);
        if (cancelled) {
          return;
        }
        setBoard(boardRes);
        setLists(listsRes);

        const cardEntries = await Promise.all(
          listsRes.map(async (list) => [list.id, await cardsApi.fetchCards(id, list.id)] as const),
        );
        if (!cancelled) {
          setCardsByListId(Object.fromEntries(cardEntries));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Something went wrong");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load(boardId);
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  async function handleCreateList(e: FormEvent) {
    e.preventDefault();
    if (!boardId) {
      return;
    }
    setError(null);
    try {
      const list = await listsApi.createList(boardId, newListTitle);
      setLists((prev) => [...prev, list]);
      setCardsByListId((prev) => ({ ...prev, [list.id]: [] }));
      setNewListTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  function handleListDeleted(listId: string) {
    setLists((prev) => prev.filter((list) => list.id !== listId));
    setCardsByListId((prev) => {
      const next = { ...prev };
      delete next[listId];
      return next;
    });
  }

  function handleCardCreated(listId: string, card: Card) {
    setCardsByListId((prev) => ({ ...prev, [listId]: [...(prev[listId] ?? []), card] }));
  }

  function handleCardDeleted(listId: string, cardId: string) {
    setCardsByListId((prev) => ({ ...prev, [listId]: (prev[listId] ?? []).filter((card) => card.id !== cardId) }));
  }

  function handleCardMoved(fromListId: string, toListId: string, card: Card) {
    setCardsByListId((prev) => ({
      ...prev,
      [fromListId]: (prev[fromListId] ?? []).filter((c) => c.id !== card.id),
      [toListId]: [...(prev[toListId] ?? []), card],
    }));
  }

  if (!boardId) {
    return <p role="alert">Board not found.</p>;
  }
  if (isLoading) {
    return <p>Loading…</p>;
  }
  if (!board) {
    return <p role="alert">{error ?? "Board not found."}</p>;
  }

  return (
    <div className="board-page">
      <header className="board-header">
        <Link to="/boards">&larr; Boards</Link>
        <h1>{board.title}</h1>
      </header>
      {error && <p role="alert">{error}</p>}

      <div className="board-columns">
        {lists.map((list) => (
          <ListColumn
            key={list.id}
            boardId={boardId}
            list={list}
            cards={cardsByListId[list.id] ?? []}
            otherLists={lists.filter((l) => l.id !== list.id)}
            onCardCreated={(card) => handleCardCreated(list.id, card)}
            onCardDeleted={(cardId) => handleCardDeleted(list.id, cardId)}
            onCardMoved={(toListId, card) => handleCardMoved(list.id, toListId, card)}
            onListDeleted={() => handleListDeleted(list.id)}
          />
        ))}

        <form onSubmit={handleCreateList} className="add-list-form" data-testid="create-list-form">
          <input
            value={newListTitle}
            onChange={(e) => setNewListTitle(e.target.value)}
            placeholder="New list title"
            data-testid="list-title-input"
            required
          />
          <button type="submit" data-testid="create-list-submit">
            Add list
          </button>
        </form>
      </div>
    </div>
  );
}
