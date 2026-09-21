import { config } from "../config.js";
import { supabase } from "../lib/supabase.js";
import { generateApiKey, hashApiKey, last4, encryptApiKey, decryptApiKey } from "../lib/crypto.js";
import { sendAccountTemplateEmail } from "./emailEvents.js";

export const PLAN_LIMITS = { free: 100, starter: null, standard: 200000, premium: 1000000 };
export const PLAN_KEY_LIMITS = { free: 2, starter: 2, standard: 10, premium: 50 };

export function getPlanLimit(plan) { return Object.prototype.hasOwnProperty.call(PLAN_LIMITS, plan) ? PLAN_LIMITS[plan] : PLAN_LIMITS.free; }
export function getPlanKeyLimit(plan) { return PLAN_KEY_LIMITS[plan] || PLAN_KEY_LIMITS.free; }

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export async function ensureCustomer(user) {
  const { error } = await supabase.from("customers").upsert({ id: user.id, display_name: user.user_metadata?.full_name || user.email || "Game API Customer", status: "active", updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
  const { data, error: readError } = await supabase.from("customers").select("id,display_name,status").eq("id", user.id).single();
  if (readError) throw readError;
  return data;
}

export async function getCustomerPlan(userId) {
  const { data, error } = await supabase.from("subscriptions").select("id,plan,status,expires_at,started_at").eq("customer_id", userId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return "free";
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    await supabase.from("subscriptions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("customer_id", userId).eq("status", "active").eq("id", data.id);
    return "free";
  }
  return ["free", "starter", "standard", "premium"].includes(data.plan) ? data.plan : "free";
}

export async function createApiKey(user, name = "Untitled key") {
  await ensureCustomer(user);
  const plan = await getCustomerPlan(user.id);
  const { count, error: countError } = await supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("customer_id", user.id).eq("status", "active");
  if (countError) throw countError;
  if ((count || 0) >= getPlanKeyLimit(plan)) {
    const error = new Error("API key limit reached for your plan"); error.status = 403; error.code = "API_KEY_LIMIT_REACHED"; throw error;
  }
  const apiKey = generateApiKey();
  const { data, error } = await supabase.from("api_keys").insert({
    customer_id: user.id, name: String(name).trim().slice(0, 80) || "Untitled key", key_prefix: config.apiKeyPrefix,
    key_hash: hashApiKey(apiKey), key_last4: last4(apiKey), encrypted_secret: encryptApiKey(apiKey), status: "active", plan
  }).select("id,customer_id,name,key_prefix,key_last4,status,last_used_at,created_at,expires_at,plan").single();
  if (error) throw error;
  await sendAccountTemplateEmail(user, "apiKeyCreated", {}, [\n    { label: "Key name", value: data.name },\n    { label: "Key", value: data.key_prefix + "_••••" + data.key_last4 },\n    { label: "Plan", value: plan },\n    { label: "Created", value: data.created_at }\n  ]);\n  return { data, secret: apiKey };
}

export async function listApiKeys(user) {
  const { data, error } = await supabase.from("api_keys").select("id,name,key_prefix,key_last4,status,last_used_at,created_at,expires_at,plan").eq("customer_id", user.id).order("created_at", { ascending: false });
  if (error) throw error;
  const keys = data || [];
  if (!keys.length) return [];
  const currentPlan = await getCustomerPlan(user.id);
  const ids = keys.map(k => k.id);
  const { data: usage, error: usageError } = await supabase.from("api_usage_monthly").select("api_key_id,request_count,period_start").in("api_key_id", ids).eq("period_start", monthStart());
  if (usageError) throw usageError;
  const usageMap = new Map((usage || []).map(row => [row.api_key_id, Number(row.request_count || 0)]));
  return keys.map(key => {
    const effectivePlan = currentPlan; const limit = getPlanLimit(effectivePlan); const used = usageMap.get(key.id) || 0;
    return { ...key, plan: effectivePlan, monthly_limit: limit, requests_used: used, requests_remaining: limit === null ? null : Math.max(limit - used, 0) };
  });
}

export async function getApiKeySecret(user, id) {
  const { data, error } = await supabase.from("api_keys").select("id,encrypted_secret,status").eq("id", id).eq("customer_id", user.id).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "active") return null;
  if (!data.encrypted_secret) return null;
  return decryptApiKey(data.encrypted_secret);
}

export async function revokeApiKey(user, id) {
  const { data, error } = await supabase.from("api_keys").update({ status: "revoked" }).eq("id", id).eq("customer_id", user.id).eq("status", "active").select("id,name,status").maybeSingle();
  if (error) throw error;
  return data;
}

export async function authenticateApiKey(apiKey) {
  if (!apiKey || !apiKey.startsWith(config.apiKeyPrefix + "_")) return null;
  const { data, error } = await supabase.from("api_keys").select("id,customer_id,name,key_prefix,key_last4,status,last_used_at,created_at,expires_at,plan").eq("key_hash", hashApiKey(apiKey)).eq("status", "active").maybeSingle();
  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) { await supabase.from("api_keys").update({ status: "revoked" }).eq("id", data.id).eq("status", "active"); return null; }
  return data;
}

async function sendAccountNotification(userId, title, message, url, tag) {
  try {
    if (!config.supabaseSecretKey) return;
    await fetch(config.supabaseUrl.replace(/\/$/, "") + "/functions/v1/push-notifications", {
      method: "POST",
      headers: { Authorization: "Bearer " + config.supabaseSecretKey, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "service-send", userId, title, message, url, tag })
    });
  } catch (error) {
    console.error("ACCOUNT NOTIFICATION ERROR:", error?.message || error);
  }
}

async function sendAccountEmail(user, template, details, variables = {}) {
  return sendAccountTemplateEmail(user, template, variables, details);
}

export async function activateSubscription(user, plan, paymentId, amount) {
  const plans = { starter: { amount: 4000, months: 3 }, standard: { amount: 25000, months: 1 }, premium: { amount: 50000, months: 1 } };
  const selected = plans[plan];
  if (!selected) { const error = new Error("Invalid paid plan"); error.status = 400; throw error; }
  await ensureCustomer(user);
  const now = new Date();
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + selected.months);
  const { data: existing } = await supabase.from("subscriptions").select("id").eq("customer_id", user.id).eq("status", "active").maybeSingle();
  if (existing) {
    await supabase.from("subscriptions").update({ status: "expired", updated_at: now.toISOString() }).eq("id", existing.id);
  }
  const { data, error } = await supabase.from("subscriptions").insert({
    customer_id: user.id, plan, status: "active", payment_id: String(paymentId || "").slice(0, 200) || null,
    amount: amount ?? selected.amount, currency: "NGN", started_at: now.toISOString(), expires_at: expires.toISOString(), updated_at: now.toISOString()
  }).select("id,plan,status,amount,currency,started_at,expires_at,payment_id").single();
  if (error) throw error;

  const notificationMessage = "Plan: " + data.plan + " · Amount: " + data.amount + " " + data.currency + " · Payment ID: " + (data.payment_id || "N/A") + " · Started: " + data.started_at + " · Expires: " + (data.expires_at || "No expiry");
  await sendAccountNotification(user.id, "Game API subscription activated", notificationMessage, "https://game-api.online/pricing.html", "subscription-activated");
  await sendAccountEmail(user, "subscriptionActivated", [
    { label: "Plan", value: data.plan },
    { label: "Amount", value: data.amount + " " + data.currency },
    { label: "Payment ID", value: data.payment_id || "N/A" },
    { label: "Started", value: data.started_at },
    { label: "Expires", value: data.expires_at || "No expiry" }
  ]);

  return data;
}

export async function cancelSubscription(user) {
  await ensureCustomer(user);
  const { data: current, error } = await supabase.from("subscriptions")
    .select("id,plan,status,amount,currency,started_at,expires_at,payment_id")
    .eq("customer_id", user.id).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!current || !["standard", "premium"].includes(current.plan)) {
    const error = new Error(current?.plan === "starter" ? "Starter is the fallback plan and cannot be cancelled." : "No cancellable paid subscription found.");
    error.status = 400;
    throw error;
  }
  const now = new Date().toISOString();
  const { error: cancelError } = await supabase.from("subscriptions").update({ status: "cancelled", updated_at: now }).eq("id", current.id);
  if (cancelError) throw cancelError;
  const { data: fallback, error: fallbackError } = await supabase.from("subscriptions").insert({
    customer_id: user.id, plan: "starter", status: "active", amount: 0, currency: "NGN",
    started_at: now, expires_at: null, payment_id: "downgrade-after-cancel", updated_at: now
  }).select("id,plan,status,amount,currency,started_at,expires_at,payment_id").single();
  if (fallbackError) throw fallbackError;

  const notificationMessage = "Cancelled plan: " + current.plan + " · Original amount: " + current.amount + " " + current.currency + " · Payment ID: " + (current.payment_id || "N/A") + " · Cancelled: " + now + " · New plan: Starter";
  await sendAccountNotification(user.id, "Game API subscription cancelled", notificationMessage, "https://game-api.online/pricing.html", "subscription-cancelled");
  await sendAccountEmail(user, "subscriptionCancelled", [
    { label: "Cancelled plan", value: current.plan },
    { label: "Original amount", value: current.amount + " " + current.currency },
    { label: "Payment ID", value: current.payment_id || "N/A" },
    { label: "Cancelled", value: now },
    { label: "New plan", value: "Starter" }
  ]);

  return { cancelled: current, subscription: fallback };
}

export async function consumeApiLimit(keyId, limit) {
  const { data, error } = await supabase.rpc("consume_api_limit", { p_api_key_id: keyId, p_limit: limit });
  if (error) throw error;
  return data;
}

export async function touchApiKey(keyId) {
  const { error } = await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId).eq("status", "active");
  if (error) console.error("Could not update API key last_used_at:", error.message);
}