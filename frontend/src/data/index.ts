import type { AuthSession } from "@/types";
import type { AuthProvider, DataService } from "@/data/types";
import { hasApiConfig, isDemoMode } from "@/config/env";
import { DemoDataService } from "@/data/demo/service";
import { ApiAuthProvider } from "@/data/api/auth";
import { ApiDataService } from "@/data/api/service";

/**
 * Service locator.
 *
 * Mode selection:
 *  - VITE_API_URL set       -> live REST backend (JWT auth) — always preferred.
 *  - VITE_DEMO_MODE=true    -> local seeded dataset with a permanent DEMO badge.
 *  - neither                -> app boots into a "setup required" screen.
 */

let authService: AuthProvider | null = null;
let dataService: DataService | null = null;
let dataServiceKey: string | null = null;

export function getAuthProvider(): AuthProvider {
  if (authService) return authService;
  authService = isDemoMode ? new DemoAuthProvider() : new ApiAuthProvider();
  return authService;
}

export function getDataService(session: AuthSession): DataService {
  const key = `${session.demo ? "demo" : "api"}:${session.gym.id}`;
  if (dataService && dataServiceKey === key) return dataService;
  dataService = session.demo ? DemoDataService.load() : new ApiDataService(session.gym.id);
  dataServiceKey = key;
  return dataService;
}

export function resetDataService(): void {
  dataService = null;
  dataServiceKey = null;
}

export type AppMode = "api" | "demo" | "unconfigured";

export function appMode(): AppMode {
  if (hasApiConfig) return "api";
  return isDemoMode ? "demo" : "unconfigured";
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
      profile: db.profile,
      gym: db.gym,
      demo: true,
    };
  }

  async signInMember(_memberCode: string, _password: string): Promise<AuthSession> {
    // The demo dataset has no member accounts — members need the live backend.
    throw new Error("Member login is only available with a live backend.");
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
