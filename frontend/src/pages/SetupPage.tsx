import { Link } from "react-router-dom";
import { DatabaseIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { appVersion } from "@/config/env";

/**
 * Shown when neither an API URL nor demo mode is configured.
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
              <h1 className="text-xl font-semibold tracking-tight">Backend not configured</h1>
              <p className="text-sm text-muted-foreground">Pulse Gym Suite v{appVersion}</p>
            </div>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            This app does not ship fake data. Point it at your Pulse Gym API server (or explicitly
            enable demo mode) and it will boot straight into the dashboard.
          </p>

          <ol className="mt-6 space-y-4">
            {[
              [
                "Run the backend server",
                "Start the REST API server (see backend-server/). It provides the auth, members, attendance, payments and reporting endpoints this app uses.",
              ],
              [
                "Point the app at the API",
                "Create .env from .env.example and set VITE_API_URL to the API base URL, e.g. VITE_API_URL=http://localhost:4000/api.",
              ],
              [
                "Restart the dev server",
                "Vite bakes VITE_* variables in at build time, so restart after editing .env. Then sign in with your staff account.",
              ],
              [
                "Or try it offline first",
                "Set VITE_DEMO_MODE=true (with VITE_API_URL empty) to explore with seeded sample data.",
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
