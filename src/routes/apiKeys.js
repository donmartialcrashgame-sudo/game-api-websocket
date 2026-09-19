import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { createApiKey, ensureCustomer, listApiKeys, getApiKeySecret, revokeApiKey, getCustomerPlan, getPlanLimit, getPlanKeyLimit } from "../services/apiKeys.js";

export const apiKeyRouter = Router();
apiKeyRouter.use(requireUser);

apiKeyRouter.get("/", async (req, res) => {
  try {
    await ensureCustomer(req.user); const keys = await listApiKeys(req.user); const plan = await getCustomerPlan(req.user.id);
    res.json({ keys, plan, monthly_limit: getPlanLimit(plan), monthly_limit_unit: "requests_per_key", max_active_keys: getPlanKeyLimit(plan) });
  } catch (error) {
    console.error("LIST API KEYS ERROR:", error); res.status(500).json({ error: "Could not list API keys", details: error?.message || "Unknown error" });
  }
});

apiKeyRouter.get("/usage", async (req, res) => {
  try {
    const keys = await listApiKeys(req.user); const plan = await getCustomerPlan(req.user.id); const per_key_limit = getPlanLimit(plan);
    const used = keys.reduce((sum, key) => sum + Number(key.requests_used || 0), 0); const monthly_limit = per_key_limit * keys.length;
    res.json({ plan, monthly_limit, requests_used: used, requests_remaining: Math.max(monthly_limit - used, 0), key_count: keys.length, max_active_keys: getPlanKeyLimit(plan), per_key_limit });
  } catch (error) {
    console.error("GET API USAGE ERROR:", error); res.status(500).json({ error: "Could not load API usage", details: error?.message || "Unknown error" });
  }
});

apiKeyRouter.post("/", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "Untitled key";
    if (req.body?.name !== undefined && typeof req.body.name !== "string") return res.status(400).json({ error: "name must be a string" });
    const result = await createApiKey(req.user, name || "Untitled key");
    res.status(201).json({ key: result.data, secret: result.secret, warning: "This secret is encrypted for secure recovery and can be copied from your account on any signed-in device." });
  } catch (error) {
    console.error("CREATE API KEY ERROR:", error);
    if (error?.status === 403) return res.status(403).json({ error: error.message, code: error.code });
    res.status(500).json({ error: "Could not create API key", details: error?.message || "Unknown error", code: error?.code || null, hint: error?.hint || null });
  }
});

apiKeyRouter.get("/:id/secret", async (req, res) => {
  try {
    const secret = await getApiKeySecret(req.user, req.params.id);
    if (!secret) return res.status(404).json({ error: "Secret is not available for this key. Keys created before secure recovery was enabled cannot be recovered." });
    res.json({ secret });
  } catch (error) {
    console.error("GET API KEY SECRET ERROR:", error); res.status(500).json({ error: "Could not recover API key secret", details: error?.message || "Unknown error" });
  }
});

apiKeyRouter.post("/:id/revoke", async (req, res) => {
  try {
    const key = await revokeApiKey(req.user, req.params.id);
    if (!key) return res.status(404).json({ error: "Active API key not found" });
    res.json({ key });
  } catch (error) {
    console.error("REVOKE API KEY ERROR:", error); res.status(500).json({ error: "Could not revoke API key", details: error?.message || "Unknown error" });
  }
});