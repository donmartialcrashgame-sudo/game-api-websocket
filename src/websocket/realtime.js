import { WebSocketServer } from "ws";
import { randomInt } from "node:crypto";
import { authenticateApiKey, touchApiKey } from "../services/apiKeys.js";
import { config } from "../config.js";
import { supabase } from "../lib/supabase.js";

const authenticatedConnections = new Map();
const anonymousConnections = new Set();

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
    send(socket, {
      type: "auth_error",
      error: "Invalid, revoked, or expired API key"
    });
    return null;
  }

  const count = authenticatedConnections.get(key.id)?.size || 0;

  if (count >= config.maxWsConnectionsPerKey) {
    send(socket, {
      type: "auth_error",
      error: "WebSocket connection limit reached"
    });
    return null;
  }

  socket.apiKey = key;
  addAuthenticatedConnection(key.id, socket);
  anonymousConnections.delete(socket);
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

  /*
   * Server-side crash round engine.
   *
   * The server owns the complete lifecycle:
   * BETTING -> RUNNING -> CRASH -> BETTING -> ...
   *
   * Clients are read-only subscribers. They cannot start, stop,
   * advance, or crash a round.
   */
  const crashEngine = {
    roundNumber: 0,
    status: "betting",
    multiplier: "1.00",
    startedAt: null,
    bettingEndsAt: null,
    crashedAt: null,
    crashPoint: null,
    timer: null,
    nextRoundTimer: null
  };

  const BETTING_DURATION_MS = 5000;
  const TICK_MS = 100;

  function currentCrashPayload() {
    if (crashEngine.status === "betting") {
      return {
        type: "crash_status",
        status: "betting",
        round_number: crashEngine.roundNumber,
        multiplier: "1.00",
        started_at: crashEngine.startedAt,
        betting_ends_at: crashEngine.bettingEndsAt
      };
    }

    if (crashEngine.status === "running") {
      return {
        type: "crash_status",
        status: "running",
        round_number: crashEngine.roundNumber,
        multiplier: crashEngine.multiplier,
        started_at: crashEngine.startedAt
      };
    }

    return {
      type: "crash_status",
      status: "crash",
      round_number: crashEngine.roundNumber,
      multiplier: crashEngine.multiplier,
      started_at: crashEngine.startedAt,
      crashed_at: crashEngine.crashedAt
    };
  }

  function startBettingRound() {
    if (!config.demoCrashSimulator) return;

    crashEngine.roundNumber += 1;
    crashEngine.status = "betting";
    crashEngine.multiplier = "1.00";
    crashEngine.startedAt = new Date().toISOString();
    crashEngine.bettingEndsAt = new Date(
      Date.now() + BETTING_DURATION_MS
    ).toISOString();
    crashEngine.crashedAt = null;

    // Test/demo crash point. Replace with the production round
    // algorithm before using this as a real-money game.
    crashEngine.crashPoint = randomInt(101, 1001) / 100;

    broadcast("crash_rounds", currentCrashPayload());

    clearTimeout(crashEngine.nextRoundTimer);
    crashEngine.nextRoundTimer = setTimeout(startRunningRound, BETTING_DURATION_MS);
  }

  function startRunningRound() {
    if (!config.demoCrashSimulator) return;

    crashEngine.status = "running";
    crashEngine.multiplier = "1.00";

    broadcast("crash_rounds", currentCrashPayload());

    clearInterval(crashEngine.timer);

    crashEngine.timer = setInterval(() => {
      const nextMultiplier = Number(
        (Number(crashEngine.multiplier) * 1.012 + 0.001).toFixed(2)
      );

      if (nextMultiplier >= crashEngine.crashPoint) {
        crashEngine.multiplier = crashEngine.crashPoint.toFixed(2);
        crashEngine.status = "crash";
        crashEngine.crashedAt = new Date().toISOString();

        clearInterval(crashEngine.timer);
        crashEngine.timer = null;

        broadcast("crash_rounds", currentCrashPayload());

        // Automatically begin the next betting phase.
        crashEngine.nextRoundTimer = setTimeout(startBettingRound, 1500);
        return;
      }

      crashEngine.multiplier = nextMultiplier.toFixed(2);
      broadcast("crash_rounds", currentCrashPayload());
    }, TICK_MS);
  }

  wss.on("connection", (socket) => {
    anonymousConnections.add(socket);
    socket.channels = new Set();

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
          send(socket, {
            type: "auth_error",
            error: "Already authenticated"
          });
        } else {
          await authenticateSocket(
            socket,
            String(message.apiKey || message.api_key || "")
          );
        }
        return;
      }

      if (message.type === "subscribe") {
        const channel = String(
          message.channel || message.table || ""
        ).trim();

        if (!["crash_rounds", "big_odd_rounds"].includes(channel)) {
          send(socket, {
            type: "error",
            error: "Unsupported channel"
          });
          return;
        }

        socket.channels.add(channel);

        send(socket, {
          type: "subscribed",
          channel
        });

        // Send the current server state immediately so a newly
        // connected client does not have to wait for the next tick.
        if (channel === "crash_rounds" && config.demoCrashSimulator) {
          send(socket, currentCrashPayload());
        }

        return;
      }

      if (message.type === "unsubscribe") {
        const channel = String(
          message.channel || message.table || ""
        ).trim();

        socket.channels.delete(channel);

        send(socket, {
          type: "unsubscribed",
          channel
        });

        return;
      }

      send(socket, {
        type: "ack",
        received: message.type || "message"
      });
    });

    socket.on("close", () => {
      anonymousConnections.delete(socket);

      if (socket.apiKey) {
        removeAuthenticatedConnection(socket.apiKey.id, socket);
      }
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`
    );

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
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "crash_rounds"
      },
      (payload) => {
        broadcast("crash_rounds", {
          type: "crash_round",
          event: payload.eventType,
          data: payload.new,
          old: payload.old
        });
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "big_odd_rounds"
      },
      (payload) => {
        broadcast("big_odd_rounds", {
          type: "big_odd_round",
          event: payload.eventType,
          data: payload.new,
          old: payload.old
        });
      }
    )
    .subscribe((status) => console.log("Supabase realtime:", status));

  // Start the server-owned crash engine automatically.
  // No browser/client action is required.
  startBettingRound();

  return {
    wss,
    realtimeChannel,
    crashEngine
  };
}
