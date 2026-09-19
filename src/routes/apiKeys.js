import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { createApiKey, ensureCustomer, listApiKeys, revokeApiKey, getCustomerPlan, getPlanLimit } from "../services/apiKeys.js";

export const apiKeyRouter = Router();

apiKeyRouter.use(requireUser);

apiKeyRouter.get("/", async (req, res) => {
  try {
    await ensureCustomer(req.user);
    const keys = await listApiKeys(req.user);
    const plan = await getCustomerPlan(req.user.id);
    res.json({ keys, plan, monthly_limit: getPlanLimit(plan), monthly_limit_unit: "requests" });
  } catch (error) {
    console.error("LIST API KEYS ERROR:", error);
    res.status(500).json({
      error: "Could not list API keys",
      details: error?.message || "Unknown error"
    });
  }
});

apiKeyRouter.get("/usage", async (req, res) => {
  try {
    const keys = await listApiKeys(req.user);
    const plan = await getCustomerPlan(req.user.id);
    const monthly_limit = getPlanLimit(plan);
    const used = keys.reduce((sum, key) => sum + Number(key.requests_used || 0), 0);
    res.json({ plan, monthly_limit, requests_used: used, requests_remaining: Math.max(monthly_limit - used, 0), key_count: keys.length });
  } catch (error) {
    console.error("GET API USAGE ERROR:", error);
    res.status(500).json({ error: "Could not load API usage", details: error?.message || "Unknown error" });
  }
});

apiKeyRouter.post("/", async (req, res) =>
  try {
    const name = typeof req.body?.name === "string"
      ? req.body.name.trim().slice(0, 80)
      : "Untitled key";

    if (req.body?.name !== undefined && typeof req.body.name !== "string") {
      return res.status(400).json({ error: "name must be a string" });
    }

    const result = await createApiKey(req.user, name || "Untitled key");

    res.status(201).json({
      key: result.data,
      secret: result.secret,
      warning: "Save this secret now. It will not be returned again."
    });
  } catch (error) {
    console.error("CREATE API KEY ERROR:", error);

    res.status(500).json({
      error: "Could not create API key",
      details: error?.message || "Unknown error",
      code: error?.code || null,
      hint: error?.hint || null
    });
  }
});

apiKeyRouter.post("/:id/revoke", async (req, res) => {
  try {
    const key = await revokeApiKey(req.user, req.params.id);
    if (!key) return res.status(404).json({ error: "Active API key not found" });
    res.json({ key });
  } catch (error) {
    console.error("REVOKE API KEY ERROR:", error);
    res.status(500).json({
      error: "Could not revoke API key",
      details: error?.message || "Unknown error"
    });
  }
});
