import { WebSocketServer } from "ws";
import { authenticateApiKey, touchApiKey } from "../services/apiKeys.js";
import { config } from "../config.js";
import { supabase } from "../lib/supabase.js";

const connectionsByKey = new Map();

function send(socket, payload) {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function addConnection(keyId, socket) {
  const current = connectionsByKey.get(keyId) || new Set();
  current.add(socket);
  connectionsByKey.set(keyId, current);
}

function removeConnection(keyId, socket) {
  const current = connectionsByKey.get(keyId);
  if (!current) return;
  current.delete(socket);
  if (!current.size) connectionsByKey.delete(keyId);
}

async function authenticateSocket(socket, apiKey) {
  const key = await authenticateApiKey(apiKey);
  if (!key) {
    send(socket, { type: "auth_error", error: "Invalid, revoked, or expired API key" });
    return null;
  }

  const count = connectionsByKey.get(key.id)?.size || 0;
  if (count >= config.maxWsConnectionsPerKey) {
    send(socket, { type: "auth_error", error: "WebSocket connection limit reached" });
    return null;
  }

  socket.apiKey = key;
  addConnection(key.id, socket);
  void touchApiKey(key.id);

  send(socket, {
    type: "authenticated",
    key_id: key.id,
    plan: key.plan,
    customer_id: key.customer_id
  });

  return key;
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket) => {
    send(socket, {
      type: "connected",
      service: "game-api-websocket",
      authenticated: false,
      protocol: "1.0"
    });

    socket.on("message", async (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: "error", error: "Invalid JSON" });
        return;
      }

      if (message.type === "ping") {
        send(socket, { type: "pong", ts: Date.now() });
        return;
      }

      if (message.type === "auth") {
        if (socket.apiKey) {
          send(socket, { type: "auth_error", error: "Already authenticated" });
        } else {
          await authenticateSocket(socket, String(message.apiKey || message.api_key || ""));
        }
        return;
      }

      if (!socket.apiKey) {
        send(socket, { type: "error", error: "Authenticate first" });
        return;
      }

      if (message.type === "subscribe") {
        const channel = String(message.channel || message.table || "").trim();
        if (!["crash_rounds", "big_odd_rounds"].includes(channel)) {
          send(socket, { type: "error", error: "Unsupported channel" });
          return;
        }

        if (!socket.channels) socket.channels = new Set();
        socket.channels.add(channel);
        send(socket, { type: "subscribed", channel });
        return;
      }

      if (message.type === "unsubscribe") {
        const channel = String(message.channel || "").trim();
        socket.channels?.delete(channel);
        send(socket, { type: "unsubscribed", channel });
        return;
      }

      send(socket, { type: "ack", received: message.type || "message" });
    });

    socket.on("close", () => {
      if (socket.apiKey) removeConnection(socket.apiKey.id, socket);
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname !== "/realtime") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (client) => {
      wss.emit("connection", client, req);
    });
  });

  const realtimeChannel = supabase
    .channel("game-api-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "crash_rounds" }, (payload) => {
      broadcast("crash_rounds", {
        type: "crash_round",
        event: payload.eventType,
        data: payload.new,
        old: payload.old
      });
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "big_odd_rounds" }, (payload) => {
      broadcast("big_odd_rounds", {
        type: "big_odd_round",
        event: payload.eventType,
        data: payload.new,
        old: payload.old
      });
    })
    .subscribe((status) => console.log("Supabase realtime:", status));

  function broadcast(channel, payload) {
    for (const clients of connectionsByKey.values()) {
      for (const client of clients) {
        if (client.channels?.has(channel)) send(client, payload);
      }
    }
  }

  return { wss, realtimeChannel };
}
