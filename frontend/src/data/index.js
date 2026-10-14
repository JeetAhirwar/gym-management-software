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
let authService = null;
let dataService = null;
let dataServiceKey = null;
export function getAuthProvider() {
    if (authService)
        return authService;
    authService = isDemoMode ? new DemoAuthProvider() : new ApiAuthProvider();
    return authService;
}
export function getDataService(session) {
    const key = `${session.demo ? "demo" : "api"}:${session.gym.id}`;
    if (dataService && dataServiceKey === key)
        return dataService;
    dataService = session.demo ? DemoDataService.load() : new ApiDataService(session.gym.id);
    dataServiceKey = key;
    return dataService;
}
export function resetDataService() {
    dataService = null;
    dataServiceKey = null;
}
export function appMode() {
    if (hasApiConfig)
        return "api";
    return isDemoMode ? "demo" : "unconfigured";
}
/* ------------------------------------------------------------------ */
/*  Demo auth                                                          */
/* ------------------------------------------------------------------ */
const DEMO_SESSION_KEY = "pgs.demo.session";
export const DEMO_CREDENTIALS = { email: "admin@pulsefit.demo", password: "demo1234" };
class DemoAuthProvider {
    mode = "demo";
    async getSession() {
        if (typeof window === "undefined")
            return null;
        const signedIn = window.sessionStorage.getItem(DEMO_SESSION_KEY) === "1";
        if (!signedIn)
            return null;
        const db = DemoDataService.load();
        return {
            userId: db.profile.id,
            email: db.profile.email,
            profile: db.profile,
            gym: db.gym,
            demo: true,
        };
    }
    async signIn(email, password) {
        if (email.trim().toLowerCase() !== DEMO_CREDENTIALS.email || password !== DEMO_CREDENTIALS.password) {
            throw new Error("Use the demo credentials shown on the login screen.");
        }
        if (typeof window !== "undefined")
            window.sessionStorage.setItem(DEMO_SESSION_KEY, "1");
        const db = DemoDataService.load();
        return {
            userId: db.profile.id,
            email: db.profile.email,
            profile: db.profile,
            gym: db.gym,
            demo: true,
        };
    }
    async signOut() {
        if (typeof window !== "undefined")
            window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    }
    onAuthChange(cb) {
        const handler = (event) => {
            void this.getSession().then(cb);
            event.preventDefault();
        };
        window.addEventListener("pgs-demo-auth", handler);
        return () => window.removeEventListener("pgs-demo-auth", handler);
    }
}
