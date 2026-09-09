import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="app-header">
      <Link to="/boards" className="app-logo">
        TrelloJunior
      </Link>
      <div className="app-header-user">
        <span>{user?.name}</span>
        <button onClick={() => void logout()} className="btn btn-ghost" data-testid="logout-button">
          Log out
        </button>
      </div>
    </header>
  );
}
