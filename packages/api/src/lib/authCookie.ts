import type { Response } from "express";

export const AUTH_COOKIE_NAME = "token";

// Single source of truth for session length: used both as the cookie's maxAge and
// (converted to seconds) as the JWT's expiresIn in routes/auth.ts, so the cookie
// and the token it holds always expire together.
export const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function cookieOptions() {
  return {
    httpOnly: true,
    // A dedicated flag, not `NODE_ENV === "production"`: those are different
    // questions. NODE_ENV says "run the optimized/compiled build"; this says
    // "is this deployment actually reachable over HTTPS". Conflating them broke
    // session persistence in WebKit when the Docker Compose setup (a real
    // production build, NODE_ENV=production, but served over plain HTTP
    // locally) set secure:true — Chromium tolerates a Secure cookie on
    // localhost over HTTP, WebKit correctly refuses to store one at all, so
    // login looked like it succeeded but the session vanished on reload.
    // Set COOKIE_SECURE=true only for a deployment that actually terminates TLS.
    secure: process.env.COOKIE_SECURE === "true",
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
