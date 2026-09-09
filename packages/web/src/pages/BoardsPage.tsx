import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as boardsApi from "../api/boards";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import type { Board } from "../types";

export function BoardsPage() {
  const { user, logout } = useAuth();
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
    <main>
      <header className="boards-header">
        <h1>Boards</h1>
        <p>
          Signed in as {user?.name}{" "}
          <button onClick={() => void logout()} data-testid="logout-button">
            Log out
          </button>
        </p>
      </header>

      <form onSubmit={handleCreate} data-testid="create-board-form">
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
        <ul data-testid="board-list">
          {boards.map((board) => (
            <li key={board.id} data-testid="board-item">
              <Link to={`/boards/${board.id}`}>{board.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
