import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { config } from "./src/config.js";
import { apiKeyRouter } from "./src/routes/apiKeys.js";
import { gameRouter } from "./src/routes/game.js";
import { attachRealtime } from "./src/websocket/realtime.js";

const app = express();
const server = createServer(app);

app.disable("x-powered-by");

const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server requests and the production frontend.
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = new Set([
      "https://game-api.online",
      "https://www.game-api.online",
      ...config.allowedOrigins.filter((value) => value !== "*")
    ]);

    if (allowedOrigins.has(origin) || config.allowedOrigins.includes("*")) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "apikey", "x-api-key"],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    service: "Game API WebSocket",
    status: "online",
    version: config.version,
    websocket: "/realtime"
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "game-api-websocket", timestamp: new Date().toISOString() });
});

app.use("/api/keys", apiKeyRouter);
app.use("/api/v1", gameRouter);

attachRealtime(server);

server.listen(config.port, () => {
  console.log(`Game API WebSocket listening on port ${config.port}`);
});
