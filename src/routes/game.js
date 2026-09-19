import { Router } from "express";
import { requireApiKey } from "../middleware/apiKey.js";
import { supabase } from "../lib/supabase.js";

export const gameRouter = Router();

gameRouter.get("/crash/rounds", requireApiKey, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const { data, error } = await supabase
    .from("crash_rounds")
    .select("id,round_number,status,multiplier,started_at,crashed_at,created_at")
    .order("round_number", { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: "Could not fetch crash rounds" });
  res.json({ data, plan: req.apiKey.plan });
});

gameRouter.get("/big-odd/rounds", requireApiKey, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const { data, error } = await supabase
    .from("big_odd_rounds")
    .select("id,odd,scheduled_at,generated_at,status,created_at")
    .order("scheduled_at", { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: "Could not fetch Big Odd rounds" });
  res.json({ data, plan: req.apiKey.plan });
});
