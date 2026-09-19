import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT || 8080);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*").split(",").map(v => v.trim()).filter(Boolean);
const keyPrefix = process.env.API_KEY_PREFIX || "gapi";

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  }
}));
app.use(express.json());

const apiKeys = new Map();

function makeSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashSecret(secret) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function getBearerSecret(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function findKey(secret) {
  if (!secret) return null;
  const digest = hashSecret(secret);
  for (const item of apiKeys.values()) {
    if (item.secret_hash === digest && item.status === "active") return item;
  }
  return null;
}

app.get("/", (_req, res) => {
  res.json({
    service: "Game API WebSocket",
    status: "online",
    version: "1.0.0",
    websocket: "/realtime"
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "game-api-websocket" });
});

app.post("/api/keys", (req, res) => {
  const name = String(req.body?.name || "Untitled key").trim().slice(0, 60) || "Untitled key";
  const secret = makeSecret();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const item = {
    id,
    name,
    key_prefix: keyPrefix,
    key_last4: secret.slice(-4),
    secret_hash: hashSecret(secret),
    status: "active",
    created_at: now,
    revoked_at: null
  };
  apiKeys.set(id, item);
  res.status(201).json({
    key: {
      id, name, key_prefix: item.key_prefix, key_last4: item.key_last4,
      status: item.status, created_at: item.created_at
    },
    secret: `${keyPrefix}_${secret}`
  });
});

app.get("/api/keys", (req, res) => {
  const secret = getBearerSecret(req);
  if (!findKey(secret)) return res.status(401).json({ error: "Valid API key required" });
  const keys = [...apiKeys.values()].map(({ secret_hash, ...safe }) => safe);
  res.json({ keys });
});

app.post("/api/keys/:id/revoke", (req, res) => {
  const secret = getBearerSecret(req);
  if (!findKey(secret)) return res.status(401).json({ error: "Valid API key required" });
  const item = apiKeys.get(req.params.id);
  if (!item) return res.status(404).json({ error: "API key not found" });
  item.status = "revoked";
  item.revoked_at = new Date().toISOString();
  res.json({ key: { id: item.id, status: item.status, revoked_at: item.revoked_at } });
});

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (socket, req, key) => {
  socket.send(JSON.stringify({
    type: "connected",
    service: "game-api-websocket",
    authenticated: Boolean(key),
    key_id: key?.id || null
  }));

  socket.on("message", raw => {
    let message;
    try { message = JSON.parse(raw.toString()); }
    catch { socket.send(JSON.stringify({ type: "error", error: "Invalid JSON" })); return; }

    if (message.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      return;
    }

    if (message.type === "auth") {
      const secret = String(message.apiKey || "");
      const found = findKey(secret);
      if (!found) {
        socket.send(JSON.stringify({ type: "auth_error", error: "Invalid API key" }));
        return;
      }
      socket.apiKey = found;
      socket.send(JSON.stringify({ type: "authenticated", key_id: found.id }));
      return;
    }

    socket.send(JSON.stringify({ type: "ack", received: message.type || "message" }));
  });

  socket.on("close", () => {});
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== "/realtime") {
    socket.destroy();
    return;
  }

  let key = null;
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : "";
  if (bearer) key = findKey(bearer);

  wss.handleUpgrade(req, socket, head, client => {
    wss.emit("connection", client, req, key);
  });
});

server.listen(port, () => {
  console.log(`Game API WebSocket listening on port ${port}`);
});
