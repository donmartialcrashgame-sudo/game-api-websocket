import { Router } from "express";
import { requireApiKey } from "../middleware/apiKey.js";
import { supabase } from "../lib/supabase.js";

export const gameRouter = Router();

function getLimit(value) {
  return Math.min(Math.max(Number(value) || 20, 1), 100);
}

async function getCrashRounds(limit) {
  return supabase
    .from("crash_rounds")
    .select("id,round_number,status,multiplier,started_at,crashed_at,created_at")
    .order("round_number", { ascending: false })
    .limit(limit);
}

async function getBigOddRounds(limit) {
  return supabase
    .from("big_odd_rounds")
    .select("id,odd,scheduled_at,generated_at,status,created_at")
    .order("scheduled_at", { ascending: false })
    .limit(limit);
}

gameRouter.post("/crash/rounds", requireApiKey, async (req, res) => {
  const limit = getLimit(req.body?.limit);
  const { data, error } = await getCrashRounds(limit);

  if (error) {
    console.error("CRASH ROUNDS ERROR:", error);
    return res.status(500).json({
      error: "Could not fetch crash rounds",
      details: error.message
    });
  }

  res.json({
    success: true,
    game: "crash",
    data,
    count: data?.length || 0,
    plan: req.apiKey.plan
  });
});

gameRouter.post("/big-odd/rounds", requireApiKey, async (req, res) => {
  const limit = getLimit(req.body?.limit);
  const { data, error } = await getBigOddRounds(limit);

  if (error) {
    console.error("BIG ODD ROUNDS ERROR:", error);
    return res.status(500).json({
      error: "Could not fetch Big Odd rounds",
      details: error.message
    });
  }

  res.json({
    success: true,
    game: "big-odd",
    data,
    count: data?.length || 0,
    plan: req.apiKey.plan
  });
});
