import type { AuthSession } from "@/types";
import type { AuthProvider } from "@/data/types";
import { DataError } from "@/data/types";
import { getSupabase } from "@/data/supabase/client";
import { mapGym, mapProfile, type GymRow, type ProfileRow } from "@/data/supabase/mappers";

type SupabaseProfileWithGym = ProfileRow & { gym?: GymRow | null };

const PROFILE_SELECT = "*, gym:gyms(*)";

export class SupabaseAuth implements AuthProvider {
  readonly mode = "supabase" as const;

  private async buildSession(userId: string, email: string | null): Promise<AuthSession | null> {
    const sb = getSupabase();
    const { data, error } = await sb.from("profiles").select(PROFILE_SELECT).eq("id", userId).maybeSingle();
    if (error) {
      // 42501 = RLS denied; the user authenticated but has no authorised profile.
      throw new DataError("profile_unavailable", error.message);
    }
    const row = data as SupabaseProfileWithGym | null;
    if (!row?.gym) return null;
    return {
      userId,
      email: email ?? row.email,
      profile: mapProfile(row),
      gym: mapGym(row.gym),
      demo: false,
    };
  }

  async getSession(): Promise<AuthSession | null> {
    const sb = getSupabase();
    const { data, error } = await sb.auth.getSession();
    if (error) throw new DataError("session_error", error.message);
    const user = data.session?.user;
    if (!user) return null;
    return this.buildSession(user.id, user.email ?? null);
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      if (/invalid login credentials/i.test(error.message)) {
        throw new DataError("invalid_credentials", "Incorrect email or password.");
      }
      if (/email not confirmed/i.test(error.message)) {
        throw new DataError("email_unconfirmed", "Confirm your email address before signing in.");
      }
      throw new DataError("sign_in_failed", error.message);
    }
    const session = await this.buildSession(data.user.id, data.user.email ?? null);
    if (!session) {
      await sb.auth.signOut();
      throw new DataError(
        "no_profile",
        "This account has no authorised gym profile yet. Create the gym + profile row for the owner (see README, section 'First admin account').",
      );
    }
    await sb.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", session.userId);
    return session;
  }

  async signOut(): Promise<void> {
    const sb = getSupabase();
    await sb.auth.signOut();
  }

  onAuthChange(cb: (session: AuthSession | null) => void): () => void {
    const sb = getSupabase();
    const { data } = sb.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        cb(null);
        return;
      }
      try {
        cb(await this.buildSession(session.user.id, session.user.email ?? null));
      } catch {
        cb(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }
}
