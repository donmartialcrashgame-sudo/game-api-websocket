import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { config } from "../config.js";
import { activateSubscription, ensureCustomer, getCustomerPlan, getPlanLimit, getPlanKeyLimit } from "../services/apiKeys.js";

export const paymentRouter = Router();
paymentRouter.use(requireUser);

paymentRouter.get("/subscription", async (req, res) => {
  try {
    await ensureCustomer(req.user);
    const { data, error } = await (await import("../lib/supabase.js")).supabase
      .from("subscriptions").select("id,plan,status,amount,currency,started_at,expires_at,payment_id")
      .eq("customer_id", req.user.id).eq("status","active").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(error) throw error;
    const plan = await getCustomerPlan(req.user.id);
    res.json({ plan, subscription: data || null, monthly_limit: getPlanLimit(plan), max_active_keys: getPlanKeyLimit(plan) });
  } catch(error) { console.error("GET SUBSCRIPTION ERROR:",error); res.status(500).json({error:"Could not load subscription",details:error?.message}); }
});

paymentRouter.post("/demo/activate", async (req, res) => {
  if (!config.demoPaymentActivation) return res.status(404).json({error:"Demo payment activation is disabled"});
  try {
    const plan = String(req.body?.plan || "").toLowerCase();
    const amount = Number(req.body?.amount);
    const expected = {starter:4000,standard:25000,premium:50000};
    if (!expected[plan] || amount !== expected[plan]) return res.status(400).json({error:"Invalid demo payment plan or amount"});
    const paymentId = String(req.body?.paymentId || "").slice(0,200);
    const subscription = await activateSubscription(req.user,plan,paymentId,amount);
    res.status(201).json({success:true,mode:"demo",subscription,plan,monthly_limit:getPlanLimit(plan),max_active_keys:getPlanKeyLimit(plan)});
  } catch(error) { console.error("DEMO PAYMENT ERROR:",error); res.status(error?.status || 500).json({error:error?.message || "Could not activate demo plan"}); }
});
