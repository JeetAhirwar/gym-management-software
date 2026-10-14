/**
 * Centralised, typed access to public runtime configuration.
 * Values are baked in at build time by Vite (all VITE_* variables are PUBLIC).
 */
const rawApiUrl = import.meta.env.VITE_API_URL;
const rawDemo = import.meta.env.VITE_DEMO_MODE;
const rawTimezone = import.meta.env.VITE_GYM_TIMEZONE;
const rawGymName = import.meta.env.VITE_GYM_NAME;
/** Accepts only absolute http(s) URLs; trailing slashes are trimmed. */
function normalizeApiUrl(value) {
    const trimmed = value?.trim();
    if (!trimmed)
        return null;
    let parsed;
    try {
        parsed = new URL(trimmed);
    }
    catch {
        return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
        return null;
    return trimmed.replace(/\/+$/, "");
}
/**
 * Deployed API fallback — baked in so a production build works even when the
 * host has no environment configuration. `VITE_API_URL` always wins when set.
 */
const PRODUCTION_API_URL = "https://gym-management-software-api.vercel.app/api";
export const apiUrl = normalizeApiUrl(rawApiUrl) ?? (import.meta.env.PROD ? normalizeApiUrl(PRODUCTION_API_URL) : null);
export const hasApiConfig = apiUrl !== null;
/**
 * Demo mode is only honoured when no API URL is configured, so a real
 * backend can never be silently shadowed by local sample data.
 */
export const isDemoMode = !hasApiConfig && rawDemo === "true";
export const isUnconfigured = !hasApiConfig && !isDemoMode;
export const gymTimezone = rawTimezone && rawTimezone.trim().length > 0 ? rawTimezone.trim() : "Asia/Kolkata";
export const defaultGymName = rawGymName && rawGymName.trim().length > 0 ? rawGymName.trim() : "Pulse Fitness Studio";
export const appVersion = "1.0.0";
/** Never log these. Kept here as a single source of truth for redaction. */
export const SENSITIVE_ENV_KEYS = ["VITE_API_URL"];
