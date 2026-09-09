import { ipKeyGenerator, rateLimit } from "express-rate-limit";

// Brute-force protection on login: 10 attempts per targeted email per 15-minute
// window, counting every attempt regardless of outcome (skipSuccessfulRequests
// defaults to false) - a credential-stuffing attempt that eventually guesses
// right shouldn't reset the counter.
//
// Keyed by the attempted email, not the caller's IP: the threat this defends
// against is repeated password guesses against one account, and keying by
// email means that's true regardless of how many IPs the attempt is spread
// across. The trade-off is that it doesn't limit one IP spraying many
// different emails (a different attack - enumeration) - out of scope for this
// pass. In-memory store, scoped to this process: fine at this app's
// single-instance scale; a multi-instance deployment would need a shared
// store (e.g. Redis) so limits apply across instances, not per-instance.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too many login attempts, please try again later" },
  keyGenerator: (req) => {
    if (typeof req.body?.email === "string") {
      return req.body.email.toLowerCase();
    }
    // Fallback for the case email is missing entirely (validated by the route
    // handler afterward, so this request 400s anyway - but the limiter still
    // needs *some* key to count it under). ipKeyGenerator, not raw req.ip:
    // a client can trivially rotate through many IPv6 addresses within their
    // own /64 subnet, so keying on the exact address would let them bypass
    // the limit; this normalizes to the subnet instead.
    return ipKeyGenerator(req.ip ?? "unknown");
  },
});
