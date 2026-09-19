import crypto from "node:crypto";
import { config } from "../config.js";

export function generateApiKey() {
  return `${config.apiKeyPrefix}_${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export function last4(apiKey) {
  return apiKey.slice(-4);
}

export function safeCompare(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
