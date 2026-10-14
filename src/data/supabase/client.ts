import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabaseAnonKey, supabaseUrl } from "@/config/env";

/**
 * Single, centralised Supabase browser client.
 *
 * Only the PUBLIC anon key is ever bundled (RLS enforces authorisation).
 * The service-role key must never appear in any VITE_* variable.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!hasSupabaseConfig || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "pulse-gym-auth",
    },
    global: {
      headers: { "x-application-name": "pulse-gym-suite" },
    },
  });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return hasSupabaseConfig;
}
