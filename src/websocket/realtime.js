import { WebSocketServer } from "ws";
import { authenticateApiKey, touchApiKey } from "../services/apiKeys.js";
import { config } from "../config.js";
import { supabase } from "../lib/supabase.js";

const authenticatedConnections = new Map();
const anonymousConnections = new Set();
let demoRoundNumber = 0;

function send(socket, payload) {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function addAuthenticatedConnection(keyId, socket) {
  const current = authenticatedConnections.get(keyId) || new Set();
  current.add(socket);
  authenticatedConnections.set(keyId, current);
}

function removeAuthenticatedConnection(keyId, socket) {
  const current = authenticatedConnections.get(keyId);
  if (!current) return;
  current.delete(socket);
  if (!current.size) authenticatedConnections.delete(keyId);
}

async function authenticateSocket(socket, apiKey) {
  const key = await authenticateApiKey(apiKey);
  if (!key) {
    send(socket, { type: "auth_error", error: "Invalid, revoked, or expired API key" });
    return null;
  }

  const count = authenticatedConnections.get(key.id)?.size || 0;
  if (count >= config.maxWsConnectionsPerKey) {
    send(socket, { type: "auth_error", error: "WebSocket connection limit reached" });
    return null;
  }

  socket.apiKey = key;
  addAuthenticatedConnection(key.id, socket);
  void touchApiKey(key.id);

  send(socket, {
    type: "authenticated",
    key_id: key.id,
    plan: key.plan,
    customer_id: key.customer_id
  });

  return key;
}

function startDemoCrashRound(socket) {
  if (socket.demoTimer) return;

  demoRoundNumber += 1;
  const roundNumber = demoRoundNumber;
  const startedAt = new Date().toISOString();

  // TEST-ONLY simulated crash point. This is not a production game result.
  const crashAt = Number((1 + Math.random() * 9).toFixed(2));
  let multiplier = 1;

  send(socket, {
    type: "crash_round_start",
    round_number: roundNumber,
    multiplier: "1.00",
    started_at: startedAt,
    mode: "demo"
  });

  socket.demoTimer = setInterval(() => {
    multiplier = Number((multiplier * 1.012 + 0.001).toFixed(2));

    if (multiplier >= crashAt) {
      send(socket, {
        type: "crash_round_end",
        round_number: roundNumber,
        multiplier: crashAt.toFixed(2),
        crashed_at: new Date().toISOString(),
        mode: "demo"
      });

      clearInterval(socket.demoTimer);
      socket.demoTimer = null;

      setTimeout(() => {
        if (socket.readyState === 1 && socket.demoSubscribed) startDemoCrashRound(socket);
      }, 1500);
      return;
    }

    send(socket, {
      type: "crash_tick",
      round_number: roundNumber,
      multiplier: multiplier.toFixed(2),
      mode: "demo"
    });
  }, 100);
}

function stopDemoCrashRound(socket) {
  if (socket.demoTimer) {
    clearInterval(socket.demoTimer);
    socket.demoTimer = null;
  }
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket) => {
    anonymousConnections.add(socket);

    send(socket, {
      type: "connected",
      service: "game-api-websocket",
      authenticated: false,
      protocol: "1.0",
      auth_required: config.wsRequireAuth
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

      if (message.type === "subscribe") {
        const channel = String(message.channel || message.table || "").trim();

        if (!["crash_rounds", "big_odd_rounds"].includes(channel)) {
          send(socket, { type: "error", error: "Unsupported channel" });
          return;
        }

        if (channel === "crash_rounds") {
          if (!config.demoCrashSimulator) {
            send(socket, { type: "error", error: "Crash simulator is disabled" });
            return;
          }

          socket.demoSubscribed = true;
          startDemoCrashRound(socket);
        }

        if (!socket.channels) socket.channels = new Set();
        socket.channels.add(channel);
        send(socket, { type: "subscribed", channel });
        return;
      }

      if (message.type === "unsubscribe") {
        const channel = String(message.channel || message.table || "").trim();
        socket.channels?.delete(channel);

        if (channel === "crash_rounds") {
          socket.demoSubscribed = false;
          stopDemoCrashRound(socket);
        }

        send(socket, { type: "unsubscribed", channel });
        return;
      }

      send(socket, { type: "ack", received: message.type || "message" });
    });

    socket.on("close", () => {
      stopDemoCrashRound(socket);
      anonymousConnections.delete(socket);
      if (socket.apiKey) removeAuthenticatedConnection(socket.apiKey.id, socket);
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
    for (const client of anonymousConnections) {
      if (client.channels?.has(channel)) send(client, payload);
    }

    for (const clients of authenticatedConnections.values()) {
      for (const client of clients) {
        if (client.channels?.has(channel)) send(client, payload);
      }
    }
  }

  return { wss, realtimeChannel };
}
