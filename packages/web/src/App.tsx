import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { BoardsPage } from "./pages/BoardsPage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/boards"
        element={
          <RequireAuth>
            <BoardsPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/boards" replace />} />
    </Routes>
  );
}
