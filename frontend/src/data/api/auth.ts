import type { AuthSession, Gym, Profile } from "@/types";
import type { AuthProvider } from "@/data/types";
import { apiGet, apiPost, ApiError, getAuthToken, setAuthToken } from "@/data/api/client";
import { loadGym, type ApiUser } from "@/data/api/service";
import { gymTimezone } from "@/lib/datetime";

type AuthListener = (session: AuthSession | null) => void;

interface LoginResponse {
  token: string;
  user: ApiUser;
}

/** Handles `{user: ...}` and the bare user object from GET /auth/me. */
function userFromMeResponse(payload: unknown): ApiUser | null {
  const record = (payload ?? {}) as { user?: ApiUser };
  const user = record.user ?? (payload as ApiUser | null);
  if (!user || typeof user.id !== "string") return null;
  return user;
}

/**
 * JWT-based auth against the REST backend.
 *
 * The token lives in localStorage (`pulse-gym-token`) and is attached to every
 * request by the API client. `onAuthChange` is a local emitter fired by
 * login/sign-out — no websockets involved.
 */
export class ApiAuthProvider implements AuthProvider {
  readonly mode = "api" as const;

  private listeners = new Set<AuthListener>();

  private emit(session: AuthSession | null): void {
    for (const listener of this.listeners) listener(session);
  }

  /**
   * The gym record powers the header/branding everywhere. Staff reach it via
   * GET /gym; member tokens are scoped to /me only, whose payload carries the
   * gym name + timezone — so fall back to that before giving up.
   */
  private async resolveGym(user: ApiUser): Promise<Gym> {
    try {
      return await loadGym();
    } catch (err) {
      if (user.role !== "member") throw err;
      const payload = await apiGet<{ gym?: Partial<Gym> }>("/me");
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

  private async buildSession(user: ApiUser): Promise<AuthSession> {
    const gym = await this.resolveGym(user);
    const now = new Date().toISOString();
    const profile: Profile = {
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

  async signIn(email: string, password: string): Promise<AuthSession> {
    try {
      const payload = await apiPost<LoginResponse>("/auth/login", { email, password });
      setAuthToken(payload.token);
      const session = await this.buildSession(payload.user);
      this.emit(session);
      return session;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        throw new ApiError(err.status, "invalid_credentials", "Incorrect email or password.");
      }
      throw err;
    }
  }

  /** Alias matching the UI's vocabulary (`signIn` is the contract method). */
  login(email: string, password: string): Promise<AuthSession> {
    return this.signIn(email, password);
  }

  /**
   * Member sign-in: same endpoint and token storage as staff, but the identity
   * is the member code (e.g. "PG-0001"). Server messages are surfaced as-is so
   * the login screen can show exactly what went wrong.
   */
  async signInMember(memberCode: string, password: string): Promise<AuthSession> {
    try {
      const payload = await apiPost<LoginResponse>("/auth/login", { memberCode, password });
      setAuthToken(payload.token);
      const session = await this.buildSession(payload.user);
      this.emit(session);
      return session;
    } catch (err) {
      // Never keep a token around when the session could not be assembled.
      setAuthToken(null);
      throw err;
    }
  }

  async getSession(): Promise<AuthSession | null> {
    if (!getAuthToken()) return null;
    try {
      const payload = await apiGet<unknown>("/auth/me");
      const user = userFromMeResponse(payload);
      if (!user) return null;
      return await this.buildSession(user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthToken(null);
        return null;
      }
      throw err;
    }
  }

  async signOut(): Promise<void> {
    setAuthToken(null);
    this.emit(null);
  }

  onAuthChange(cb: AuthListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}
