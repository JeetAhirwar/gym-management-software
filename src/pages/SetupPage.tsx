import { Link } from "react-router-dom";
import { DatabaseIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { appVersion } from "@/config/env";

/**
 * Shown when neither Supabase credentials nor demo mode are configured.
 * Explains exactly what is missing instead of pretending to work.
 */
export function SetupPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5 py-12">
      <Card className="w-full max-w-2xl border-border/70">
        <CardContent className="p-8">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <DatabaseIcon className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Database not configured</h1>
              <p className="text-sm text-muted-foreground">Pulse Gym Suite v{appVersion}</p>
            </div>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            This app does not ship fake data. Connect your Supabase project (or explicitly enable demo
            mode) and it will boot straight into the dashboard.
          </p>

          <ol className="mt-6 space-y-4">
            {[
              [
                "Create .env from .env.example",
                "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project settings (API section).",
              ],
              [
                "Run the SQL migrations",
                "Execute every file in supabase/migrations/ in order (SQL editor or supabase db push). This creates tables, RPCs and RLS policies.",
              ],
              [
                "Create the first owner account",
                "Sign up in Supabase Auth, then insert its gym + profile row — see supabase/README.md for the exact snippet.",
              ],
              [
                "Or try it offline first",
                "Set VITE_DEMO_MODE=true (with Supabase keys empty) to explore with seeded sample data.",
              ],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild>
              <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
                Open Supabase dashboard
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/login">
                <ShieldCheckIcon className="size-4" /> I already configured it
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
