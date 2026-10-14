import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BellIcon,
  LogOutIcon,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  ShieldAlertIcon,
  UserIcon,
  UserRoundIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/auth/AuthProvider";
import { SmartImage } from "@/components/shared/SmartImage";
import { ROLE_LABELS } from "@/lib/permissions";
import { appVersion } from "@/config/env";

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { session, data, signOut } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    void data
      .getUnreadNotificationCount()
      .then((count) => {
        if (!cancelled) setUnread(count);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data]);

  const profile = session?.profile;
  const demo = useMemo(() => Boolean(session?.demo), [session]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    navigate(`/members?search=${encodeURIComponent(term)}`);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onOpenMenu}
          aria-label="Open navigation"
        >
          <MenuIcon className="size-5" />
        </Button>

        <form onSubmit={submitSearch} className="relative hidden max-w-md flex-1 sm:block" role="search">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search members by name, phone or ID…"
            className="h-9 pl-9"
            aria-label="Search members"
          />
        </form>

        <div className="ml-auto flex items-center gap-2">
          {demo ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-warning sm:inline-flex">
              <ShieldAlertIcon className="size-3.5" /> DEMO MODE
            </span>
          ) : null}

          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            className="relative"
          >
            <Link to="/notifications">
              <BellIcon className="size-4.5" />
              {unread > 0 ? (
                <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full outline-none ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Account menu"
              >
                <SmartImage
                  src={profile?.avatarUrl}
                  name={profile?.fullName ?? "User"}
                  className="size-8 border border-border"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>
                <p className="text-sm font-medium">{profile?.fullName}</p>
                <p className="text-xs font-normal text-muted-foreground">{profile?.email}</p>
                <p className="mt-1 text-[11px] text-primary">{ROLE_LABELS[profile?.role ?? "front_desk"]}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <UserIcon className="size-4" /> Profile & settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings?tab=gym">
                  <SettingsIcon className="size-4" /> Gym configuration
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  void signOut().then(() => navigate("/login"));
                }}
              >
                <LogOutIcon className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <p className="sr-only">Pulse Gym Suite v{appVersion}</p>
      <span className="hidden">
        <UserRoundIcon />
      </span>
    </header>
  );
}
