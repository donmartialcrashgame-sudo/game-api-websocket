import { authenticateApiKey, touchApiKey, consumeApiLimit, getPlanLimit } from "../services/apiKeys.js";
import { config } from "../config.js";

const lastTouched = new Map();

export function getApiKey(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.headers["x-api-key"]?.trim() || "";
}

export async function requireApiKey(req, res, next) {
  try {
    const secret = getApiKey(req);
    const key = await authenticateApiKey(secret);
    if (!key) return res.status(401).json({ error: "Invalid, revoked, or expired API key" });

    const limit = getPlanLimit(key.plan);
    if (limit === null) {
      req.apiKey = {
        ...key,
        monthlyLimit: null,
        requestsUsed: null,
        requestsRemaining: null
      };
      return next();
    }

    const usage = await consumeApiLimit(key.id, limit);
    if (!usage.allowed) {
      const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
      res.set("Retry-After", String(Math.max(60, Math.ceil((nextMonth.getTime() - Date.now()) / 1000))));
      return res.status(429).json({
        error: "API monthly limit reached",
        plan: key.plan,
        limit: usage.limit,
        used: usage.count,
        remaining: 0,
        period_start: usage.period_start
      });
    }

    req.apiKey = {
      ...key,
      monthlyLimit: usage.limit,
      requestsUsed: usage.count,
      requestsRemaining: usage.remaining
    };

    const now = Date.now();
    const previous = lastTouched.get(key.id) || 0;
    if (now - previous >= config.keyLastUsedUpdateMs) {
      lastTouched.set(key.id, now);
      void touchApiKey(key.id);
    }

    next();
  } catch (error) {
    console.error("API key authentication error:", error);
    res.status(500).json({ error: "API key authentication failed" });
  }
}
