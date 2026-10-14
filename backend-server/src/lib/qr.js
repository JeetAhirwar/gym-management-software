import crypto from "node:crypto";

/**
 * QR identity helpers — port of src/lib/qr.ts.
 * The QR payload carries ONLY an opaque random token; the database stores
 * that token and resolves it server-side, re-validating membership state
 * and cooldown before writing anything.
 */

export const QR_PAYLOAD_PREFIX = "PGS1";

/** 32 random bytes as lowercase hex (256 bits of entropy). */
export function generateQrToken() {
  return crypto.randomBytes(32).toString("hex");
}

/** Canonical payload encoded into the printed QR image. */
export function qrPayload(token) {
  return `${QR_PAYLOAD_PREFIX}:${token}`;
}

/** Extract a token from a scanned payload (tolerates raw token without prefix). */
export function parseQrPayload(payload) {
  const trimmed = String(payload ?? "").trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith(`${QR_PAYLOAD_PREFIX}:`)) {
    const token = trimmed.slice(QR_PAYLOAD_PREFIX.length + 1).trim();
    return token.length >= 16 ? token : null;
  }
  // Raw token support (e.g. someone printed only the token).
  if (/^[a-f0-9]{32,128}$/i.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

/** Short human-readable token fragment for support conversations. */
export function tokenHint(token) {
  return token.slice(0, 4).toUpperCase() + "…" + token.slice(-4).toUpperCase();
}
