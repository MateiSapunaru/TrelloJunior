import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
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
  return jwt.sign({ sub: userId }, secret, { expiresIn: "1h" });
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

  const token = signToken(user.id);
  res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
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

  const token = signToken(user.id);
  res.status(200).json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

export default router;
