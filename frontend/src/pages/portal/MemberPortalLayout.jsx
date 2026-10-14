import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { DumbbellIcon, LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartImage } from "@/components/shared/SmartImage";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import "./portal-paper.css";

const NAV_ITEMS = [
    { to: "/portal", label: "Home", end: true },
    { to: "/portal/attendance", label: "Attendance" },
    { to: "/portal/payments", label: "Payments" },
    { to: "/portal/password", label: "Password" },
];
/**
 * Shell for the member self-service portal — deliberately NOT the staff
 * AppShell: no sidebar, no topbar, no capability-gated staff navigation.
 * The paper-craft stylesheet (portal-paper.css) is loaded once, here, so every
 * portal page can use the `pp-*` surfaces.
 */
export function MemberPortalLayout() {
    const { session, signOut } = useAuth();
    const navigate = useNavigate();
    const profile = session?.profile;
    const handleSignOut = async () => {
        await signOut();
        navigate("/login", { replace: true });
    };
    return (<div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <DumbbellIcon className="size-4"/>
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                {session?.gym.name ?? "Pulse Gym Suite"}
              </p>
              <p className="truncate font-serif text-[11px] text-muted-foreground italic">Member portal</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden min-w-0 text-right sm:block">
              <span className="block truncate text-sm font-medium">{profile?.fullName}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {profile?.email ?? profile?.phone ?? "Member"}
              </span>
            </span>
            <SmartImage src={profile?.avatarUrl} name={profile?.fullName ?? "Member"} className="size-8 shrink-0 text-[11px]"/>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOutIcon className="size-4"/> Sign out
            </Button>
          </div>
        </div>

        <nav aria-label="Member portal" className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {NAV_ITEMS.map((item) => (<NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn("rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors", isActive
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground")}>
              {item.label}
            </NavLink>))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>);
}
