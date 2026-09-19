import { authenticateApiKey, touchApiKey } from "../services/apiKeys.js";
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

    req.apiKey = key;
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
