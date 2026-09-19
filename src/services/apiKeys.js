import { config } from "../config.js";
import { supabase } from "../lib/supabase.js";
import { generateApiKey, hashApiKey, last4 } from "../lib/crypto.js";

export async function ensureCustomer(user) {
  const { error } = await supabase
    .from("customers")
    .upsert({
      id: user.id,
      display_name: user.user_metadata?.full_name || user.email || "Game API Customer",
      status: "active",
      updated_at: new Date().toISOString()
    }, { onConflict: "id" });

  if (error) throw error;

  const { data, error: readError } = await supabase
    .from("customers")
    .select("id,display_name,status")
    .eq("id", user.id)
    .single();

  if (readError) throw readError;
  return data;
}

export async function createApiKey(user, name = "Untitled key", plan = "free") {
  await ensureCustomer(user);

  const apiKey = generateApiKey();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      customer_id: user.id,
      name: String(name).trim().slice(0, 80) || "Untitled key",
      key_prefix: config.apiKeyPrefix,
      key_hash: hashApiKey(apiKey),
      key_last4: last4(apiKey),
      status: "active",
      plan: ["free", "standard", "premium"].includes(plan) ? plan : "free"
    })
    .select("id,customer_id,name,key_prefix,key_last4,status,last_used_at,created_at,expires_at,plan")
    .single();

  if (error) throw error;
  return { data, secret: apiKey };
}

export async function listApiKeys(user) {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id,name,key_prefix,key_last4,status,last_used_at,created_at,expires_at,plan")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function revokeApiKey(user, id) {
  const { data, error } = await supabase
    .from("api_keys")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("customer_id", user.id)
    .eq("status", "active")
    .select("id,name,status")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function authenticateApiKey(apiKey) {
  if (!apiKey || !apiKey.startsWith(`${config.apiKeyPrefix}_`)) return null;

  const { data, error } = await supabase
    .from("api_keys")
    .select("id,customer_id,name,key_prefix,key_last4,status,last_used_at,created_at,expires_at,plan")
    .eq("key_hash", hashApiKey(apiKey))
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;

  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    await supabase.from("api_keys").update({ status: "revoked" }).eq("id", data.id).eq("status", "active");
    return null;
  }

  return data;
}

export async function touchApiKey(keyId) {
  const { error } = await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("status", "active");

  if (error) console.error("Could not update API key last_used_at:", error.message);
}
