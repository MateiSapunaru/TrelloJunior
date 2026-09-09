import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signup(email, password, name);
      navigate("/boards");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <span className="auth-logo">TrelloJunior</span>
      <form onSubmit={handleSubmit} data-testid="signup-form">
        <h1>Sign up</h1>
        {error && (
          <p role="alert" data-testid="signup-error">
            {error}
          </p>
        )}
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} data-testid="signup-name" required />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="signup-email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="signup-password"
            minLength={8}
            required
          />
        </label>
        <button type="submit" disabled={isSubmitting} data-testid="signup-submit">
          Sign up
        </button>
        <p className="auth-hint">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </main>
  );
}
