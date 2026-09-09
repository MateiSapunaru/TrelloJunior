import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as boardsApi from "../api/boards";
import { ApiError } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import type { Board } from "../types";

export function BoardsPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    boardsApi
      .fetchBoards()
      .then(setBoards)
      .finally(() => setIsLoading(false));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const board = await boardsApi.createBoard(title);
      setBoards((prev) => [board, ...prev]);
      setTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div>
      <AppHeader />
      <main className="boards-page-body">
        <h1>Your boards</h1>

        <form onSubmit={handleCreate} className="create-board-form" data-testid="create-board-form">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New board title"
            data-testid="board-title-input"
            required
          />
          <button type="submit" data-testid="create-board-submit">
            Create board
          </button>
        </form>
        {error && <p role="alert">{error}</p>}

        {isLoading ? (
          <p>Loading…</p>
        ) : (
          <ul className="board-grid" data-testid="board-list">
            {boards.map((board) => (
              <li key={board.id} data-testid="board-item">
                <Link to={`/boards/${board.id}`}>{board.title}</Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
