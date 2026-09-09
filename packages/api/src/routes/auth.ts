import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { clearAuthCookie, setAuthCookie, TOKEN_TTL_MS } from "../lib/authCookie";
import { getUserId } from "../lib/requestContext";
import { requireAuth } from "../middleware/auth";
import User from "../models/User";

const router = Router();

const BCRYPT_SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

// Compared against when no user is found, so a login attempt for a nonexistent
// email takes the same amount of time as one for a real email with a wrong
// password. Without this, bcrypt.compare's cost makes response time leak
// whether an email is registered.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_SALT_ROUNDS);

function signToken(userId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return jwt.sign({ sub: userId }, secret, { expiresIn: TOKEN_TTL_MS / 1000 });
}

router.post("/signup", async (req, res) => {
  const { email, password, name } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string" || typeof name !== "string") {
    res.status(400).json({ error: "email, password, and name are required" });
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    res.status(409).json({ error: "email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  const user = await User.create({ email, passwordHash, name });

  // The JWT lives only in the Set-Cookie header (httpOnly), never in a JSON body a
  // script could read — putting it in the response here would defeat the point.
  setAuthCookie(res, signToken(user.id));
  res.status(201).json({ user: { id: user.id, email: user.email, name: user.name } });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordMatches) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }

  setAuthCookie(res, signToken(user.id));
  res.status(200).json({ user: { id: user.id, email: user.email, name: user.name } });
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.status(204).send();
});

// Because the token lives in an httpOnly cookie, client-side JS can't read it to
// know whether the user is logged in (e.g. after a page reload). This is what the
// frontend's AuthContext calls on startup to recover session state.
router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(getUserId(req));
  if (!user) {
    res.status(401).json({ error: "invalid or expired token" });
    return;
  }

  res.status(200).json({ user: { id: user.id, email: user.email, name: user.name } });
});

export default router;
