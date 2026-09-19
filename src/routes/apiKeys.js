import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { createApiKey, ensureCustomer, listApiKeys, revokeApiKey } from "../services/apiKeys.js";

export const apiKeyRouter = Router();

apiKeyRouter.use(requireUser);

apiKeyRouter.get("/", async (req, res) => {
  try {
    await ensureCustomer(req.user);
    res.json({ keys: await listApiKeys(req.user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not list API keys" });
  }
});

apiKeyRouter.post("/", async (req, res) => {
  try {
    const result = await createApiKey(req.user, req.body?.name, req.body?.plan);
    res.status(201).json({
      key: result.data,
      secret: result.secret,
      warning: "Save this secret now. It will not be returned again."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not create API key" });
  }
});

apiKeyRouter.post("/:id/revoke", async (req, res) => {
  try {
    const key = await revokeApiKey(req.user, req.params.id);
    if (!key) return res.status(404).json({ error: "Active API key not found" });
    res.json({ key });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not revoke API key" });
  }
});
