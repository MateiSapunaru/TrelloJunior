import type { User } from "../types";
import { apiRequest } from "./client";

export function signup(email: string, password: string, name: string): Promise<{ user: User }> {
  return apiRequest("/auth/signup", { method: "POST", body: { email, password, name } });
}

export function login(email: string, password: string): Promise<{ user: User }> {
  return apiRequest("/auth/login", { method: "POST", body: { email, password } });
}

export function logout(): Promise<void> {
  return apiRequest("/auth/logout", { method: "POST" });
}

export function fetchMe(): Promise<{ user: User }> {
  return apiRequest("/auth/me");
}
