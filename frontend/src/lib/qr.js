import QRCode from "qrcode";
/**
 * QR identity helpers.
 *
 * The QR payload carries ONLY an opaque random token — never a member id, name
 * or any personal data. The database stores that opaque token and resolves it
 * server-side (`record_attendance` RPC), which re-validates membership state
 * and cooldown before writing anything.
 */
export const QR_PAYLOAD_PREFIX = "PGS1";
/** 32 random bytes as lowercase hex (256 bits of entropy). */
export function generateQrToken() {
    const bytes = new Uint8Array(32);
    if (typeof globalThis.crypto?.getRandomValues === "function") {
        globalThis.crypto.getRandomValues(bytes);
    }
    else {
        // Extremely defensive fallback; only reachable in exotic runtimes.
        for (let i = 0; i < bytes.length; i += 1)
            bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
/** Canonical payload encoded into the printed QR image. */
export function qrPayload(token) {
    return `${QR_PAYLOAD_PREFIX}:${token}`;
}
/** Extract a token from a scanned payload (tolerates raw token without prefix). */
export function parseQrPayload(payload) {
    const trimmed = payload.trim();
    if (trimmed.length === 0)
        return null;
    if (trimmed.startsWith(`${QR_PAYLOAD_PREFIX}:`)) {
        const token = trimmed.slice(QR_PAYLOAD_PREFIX.length + 1).trim();
        return token.length >= 16 ? token : null;
    }
    // Raw token support (e.g. someone printed only the token).
    if (/^[a-f0-9]{32,128}$/i.test(trimmed))
        return trimmed.toLowerCase();
    return null;
}
/** Generate a PNG data URL for the QR (used for display + downloads). */
export async function renderQrDataUrl(token, options) {
    return QRCode.toDataURL(qrPayload(token), {
        width: options?.width ?? 320,
        margin: options?.margin ?? 2,
        errorCorrectionLevel: "M",
        color: {
            dark: options?.dark ?? "#0d0f10",
            light: options?.light ?? "#ffffff",
        },
    });
}
/** Short human-readable token fragment for support conversations. */
export function tokenHint(token) {
    return token.slice(0, 4).toUpperCase() + "…" + token.slice(-4).toUpperCase();
}
