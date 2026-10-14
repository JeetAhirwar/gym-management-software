/**
 * Centralised, typed access to public runtime configuration.
 * Values are baked in at build time by Vite (all VITE_* variables are PUBLIC).
 */

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const rawDemo = import.meta.env.VITE_DEMO_MODE as string | undefined;
const rawTimezone = import.meta.env.VITE_GYM_TIMEZONE as string | undefined;
const rawGymName = import.meta.env.VITE_GYM_NAME as string | undefined;

function isValidSupabaseUrl(value: string): boolean {
  return /^https:\/\/[a-z0-9-]+\.supabase\.(co|in|net)\/?$/i.test(value.trim());
}

export const supabaseUrl = rawUrl && isValidSupabaseUrl(rawUrl) ? rawUrl.replace(/\/$/, "") : null;
export const supabaseAnonKey = rawAnonKey && rawAnonKey.trim().length > 20 ? rawAnonKey.trim() : null;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Demo mode is only honoured when Supabase credentials are absent, so a real
 * project can never be silently shadowed by local sample data.
 */
export const isDemoMode = !hasSupabaseConfig && rawDemo === "true";

export const isUnconfigured = !hasSupabaseConfig && !isDemoMode;

export const gymTimezone = rawTimezone && rawTimezone.trim().length > 0 ? rawTimezone.trim() : "Asia/Kolkata";

export const defaultGymName = rawGymName && rawGymName.trim().length > 0 ? rawGymName.trim() : "Pulse Fitness Studio";

export const appVersion = "1.0.0";

/** Never log these. Kept here as a single source of truth for redaction. */
export const SENSITIVE_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
