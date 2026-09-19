import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./src/config.js";
import { apiKeyRouter } from "./src/routes/apiKeys.js";
import { gameRouter } from "./src/routes/game.js";
import { attachRealtime } from "./src/websocket/realtime.js";

const app = express();
const server = createServer(app);

app.disable("x-powered-by");
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.allowedOrigins.includes("*") || config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true
}));
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
