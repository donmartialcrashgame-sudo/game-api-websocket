import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseSecretKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);
