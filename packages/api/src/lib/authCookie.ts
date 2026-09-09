import type { Response } from "express";

export const AUTH_COOKIE_NAME = "token";

// Single source of truth for session length: used both as the cookie's maxAge and
// (converted to seconds) as the JWT's expiresIn in routes/auth.ts, so the cookie
// and the token it holds always expire together.
export const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function cookieOptions() {
  return {
    httpOnly: true,
    // false in local dev (plain http://localhost) — a browser silently refuses to
    // store a `secure` cookie over http, which would make login look like it
    // succeeded (200 response) while auth quietly never persisted.
    secure: process.env.NODE_ENV === "production",
    // "strict" is enough CSRF protection here: this app has no cross-site login
    // redirect or third-party embed flow that strict mode would break, and it
    // blocks the cookie from being attached to any request that originates from
    // another site.
    sameSite: "strict" as const,
    path: "/",
  };
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, { ...cookieOptions(), maxAge: TOKEN_TTL_MS });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, cookieOptions());
}
