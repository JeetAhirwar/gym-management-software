import type { AuthSession } from "@/types";
import type { AuthProvider, DataService } from "@/data/types";
import { isDemoMode, isUnconfigured } from "@/config/env";
import { DemoDataService } from "@/data/demo/service";
import { SupabaseAuth } from "@/data/supabase/auth";
import { SupabaseDataService } from "@/data/supabase/service";
import { mapGym, mapProfile } from "@/data/supabase/mappers";

/**
 * Service locator.
 *
 * Mode selection:
 *  - Supabase configured  -> live Postgres (RLS enforced) — always preferred.
 *  - VITE_DEMO_MODE=true  -> local seeded dataset with a permanent DEMO badge.
 *  - neither              -> app boots into a "setup required" screen.
 */

let authService: AuthProvider | null = null;
let dataService: DataService | null = null;
let dataServiceKey: string | null = null;

export function getAuthProvider(): AuthProvider {
  if (authService) return authService;
  authService = isDemoMode ? new DemoAuthProvider() : new SupabaseAuth();
  return authService;
}

export function getDataService(session: AuthSession): DataService {
  const key = `${session.demo ? "demo" : "supabase"}:${session.gym.id}`;
  if (dataService && dataServiceKey === key) return dataService;
  dataService = session.demo
    ? DemoDataService.load()
    : new SupabaseDataService(session.gym.id);
  dataServiceKey = key;
  return dataService;
}

export function resetDataService(): void {
  dataService = null;
  dataServiceKey = null;
}

export type AppMode = "supabase" | "demo" | "unconfigured";

export function appMode(): AppMode {
  if (isUnconfigured) return "unconfigured";
  return isDemoMode ? "demo" : "supabase";
}

/* ------------------------------------------------------------------ */
/*  Demo auth                                                          */
/* ------------------------------------------------------------------ */

const DEMO_SESSION_KEY = "pgs.demo.session";
export const DEMO_CREDENTIALS = { email: "admin@pulsefit.demo", password: "demo1234" };

class DemoAuthProvider implements AuthProvider {
  readonly mode = "demo" as const;

  async getSession(): Promise<AuthSession | null> {
    if (typeof window === "undefined") return null;
    const signedIn = window.sessionStorage.getItem(DEMO_SESSION_KEY) === "1";
    if (!signedIn) return null;
    const db = DemoDataService.load();
    return {
      userId: db.profile.id,
      email: db.profile.email,
      profile: db.profile,
      gym: db.gym,
      demo: true,
    };
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    if (email.trim().toLowerCase() !== DEMO_CREDENTIALS.email || password !== DEMO_CREDENTIALS.password) {
      throw new Error("Use the demo credentials shown on the login screen.");
    }
    if (typeof window !== "undefined") window.sessionStorage.setItem(DEMO_SESSION_KEY, "1");
    const db = DemoDataService.load();
    return {
      userId: db.profile.id,
      email: db.profile.email,
      profile: mapProfile({
        id: db.profile.id,
        gym_id: db.profile.gymId,
        full_name: db.profile.fullName,
        email: db.profile.email,
        phone: db.profile.phone,
        role: db.profile.role,
        avatar_url: db.profile.avatarUrl,
        is_active: db.profile.isActive,
        last_login_at: db.profile.lastLoginAt,
        created_at: db.profile.createdAt,
        updated_at: db.profile.updatedAt,
      }),
      gym: mapGym({
        id: db.gym.id,
        name: db.gym.name,
        slug: db.gym.slug,
        timezone: db.gym.timezone,
        currency: db.gym.currency,
        logo_url: db.gym.logoUrl,
        address: db.gym.address,
        phone: db.gym.phone,
        email: db.gym.email,
        is_active: db.gym.isActive,
        created_at: db.gym.createdAt,
        updated_at: db.gym.updatedAt,
      }),
      demo: true,
    };
  }

  async signOut(): Promise<void> {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(DEMO_SESSION_KEY);
  }

  onAuthChange(cb: (session: AuthSession | null) => void): () => void {
    const handler = (event: Event) => {
      void this.getSession().then(cb);
      event.preventDefault();
    };
    window.addEventListener("pgs-demo-auth", handler);
    return () => window.removeEventListener("pgs-demo-auth", handler);
  }
}
