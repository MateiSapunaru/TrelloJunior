import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import * as authApi from "../api/auth";
import type { User } from "../types";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The JWT lives in an httpOnly cookie, so client-side JS can never read it to know
  // whether the user is logged in - the only way to recover session state on load
  // (e.g. after a refresh) is to ask the server.
  useEffect(() => {
    authApi
      .fetchMe()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setUser(res.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    const res = await authApi.signup(email, password, name);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>{children}</AuthContext.Provider>;
}
