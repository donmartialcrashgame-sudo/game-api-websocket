const csv = (value, fallback = []) =>
  String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean).length
    ? String(value).split(",").map((item) => item.trim()).filter(Boolean)
    : fallback;

export const config = {
  version: "1.0.0",
  port: Number(process.env.PORT || 8080),
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  apiKeyPrefix: process.env.API_KEY_PREFIX || "gapi",
  allowedOrigins: csv(process.env.ALLOWED_ORIGINS, ["*"]),
  maxWsConnectionsPerKey: Number(process.env.MAX_WS_CONNECTIONS_PER_KEY || 100),
  keyLastUsedUpdateMs: Number(process.env.KEY_LAST_USED_UPDATE_MS || 60000),
  wsRequireAuth: String(process.env.WS_REQUIRE_AUTH || "false").toLowerCase() === "true",
  demoCrashSimulator: String(process.env.DEMO_CRASH_SIMULATOR || "true").toLowerCase() === "true"
};

if (!config.supabaseUrl || !config.supabaseSecretKey) {
  console.warn("SUPABASE_URL and SUPABASE_SECRET_KEY must be configured before protected routes are used.");
}
