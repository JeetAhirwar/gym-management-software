import { apiGet, apiPost, ApiError, getAuthToken, setAuthToken } from "@/data/api/client";
import { loadGym } from "@/data/api/service";
import { gymTimezone } from "@/lib/datetime";
/** Handles `{user: ...}` and the bare user object from GET /auth/me. */
function userFromMeResponse(payload) {
    const record = (payload ?? {});
    const user = record.user ?? payload;
    if (!user || typeof user.id !== "string")
        return null;
    return user;
}
/**
 * JWT-based auth against the REST backend.
 *
 * The token lives in localStorage (`pulse-gym-token`) and is attached to every
 * request by the API client. `onAuthChange` is a local emitter fired by
 * login/sign-out — no websockets involved.
 */
export class ApiAuthProvider {
    mode = "api";
    listeners = new Set();
    emit(session) {
        for (const listener of this.listeners)
            listener(session);
    }
    /**
     * The gym record powers the header/branding everywhere. Staff reach it via
     * GET /gym; member tokens are scoped to /me only, whose payload carries the
     * gym name + timezone — so fall back to that before giving up.
     */
    async resolveGym(user) {
        try {
            return await loadGym();
        }
        catch (err) {
            if (user.role !== "member")
                throw err;
            const payload = await apiGet("/me");
            const now = new Date().toISOString();
            const fallback = payload?.gym ?? {};
            return {
                id: user.gymId,
                name: fallback.name ?? "Member portal",
                slug: fallback.slug ?? "",
                timezone: fallback.timezone ?? gymTimezone,
                currency: fallback.currency ?? "INR",
                logoUrl: fallback.logoUrl ?? null,
                address: fallback.address ?? null,
                phone: fallback.phone ?? null,
                email: fallback.email ?? null,
                isActive: fallback.isActive ?? true,
                createdAt: fallback.createdAt ?? now,
                updatedAt: fallback.updatedAt ?? now,
            };
        }
    }
    async buildSession(user) {
        const gym = await this.resolveGym(user);
        const now = new Date().toISOString();
        const profile = {
            id: user.id,
            gymId: user.gymId ?? gym.id,
            fullName: user.fullName,
            email: user.email ?? null,
            phone: user.phone ?? null,
            role: user.role,
            avatarUrl: user.avatarUrl ?? null,
            isActive: true,
            lastLoginAt: null,
            createdAt: now,
            updatedAt: now,
        };
        return {
            userId: user.id,
            email: user.email ?? null,
            profile,
            gym,
            demo: false,
        };
    }
    async signIn(email, password) {
        try {
            const payload = await apiPost("/auth/login", { email, password });
            setAuthToken(payload.token);
            const session = await this.buildSession(payload.user);
            this.emit(session);
            return session;
        }
        catch (err) {
            if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
                throw new ApiError(err.status, "invalid_credentials", "Incorrect email or password.");
            }
            throw err;
        }
    }
    /** Alias matching the UI's vocabulary (`signIn` is the contract method). */
    login(email, password) {
        return this.signIn(email, password);
    }
    async getSession() {
        if (!getAuthToken())
            return null;
        try {
            const payload = await apiGet("/auth/me");
            const user = userFromMeResponse(payload);
            if (!user)
                return null;
            return await this.buildSession(user);
        }
        catch (err) {
            if (err instanceof ApiError && err.status === 401) {
                setAuthToken(null);
                return null;
            }
            throw err;
        }
    }
    async signOut() {
        setAuthToken(null);
        this.emit(null);
    }
    onAuthChange(cb) {
        this.listeners.add(cb);
        return () => {
            this.listeners.delete(cb);
        };
    }
}
