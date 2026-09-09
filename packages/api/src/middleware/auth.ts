import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AUTH_COOKIE_NAME } from "../lib/authCookie";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token: unknown = req.cookies?.[AUTH_COOKIE_NAME];

  if (typeof token !== "string") {
    res.status(401).json({ error: "missing token" });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  try {
    const payload = jwt.verify(token, secret) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}
