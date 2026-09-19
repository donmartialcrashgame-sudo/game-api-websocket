import crypto from "node:crypto";
import { config } from "../config.js";

export function generateApiKey() {
  return config.apiKeyPrefix + "_" + crypto.randomBytes(32).toString("base64url");
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

function encryptionKey() {
  return crypto.createHash("sha256").update(String(config.supabaseSecretKey)).digest();
}

export function encryptApiKey(apiKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map(part => part.toString("base64url")).join(".");
}

export function decryptApiKey(payload) {
  const [ivText, tagText, ciphertextText] = String(payload || "").split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Invalid encrypted API key");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}