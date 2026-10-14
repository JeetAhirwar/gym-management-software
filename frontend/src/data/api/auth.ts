import type { AuthSession, Gym, Profile } from "@/types";
import type { AuthProvider } from "@/data/types";
import { apiGet, apiPost, ApiError, getAuthToken, setAuthToken } from "@/data/api/client";
import { loadGym, type ApiUser } from "@/data/api/service";

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
  /** Literal is "api"; typed as the contract's union because `src/data/types.ts` is frozen. */
  readonly mode = "api" as const;

  private listeners = new Set<AuthListener>();

  private emit(session: AuthSession | null): void {
    for (const listener of this.listeners) listener(session);
  }

  private async buildSession(user: ApiUser): Promise<AuthSession> {
    const gym: Gym = await loadGym();
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
