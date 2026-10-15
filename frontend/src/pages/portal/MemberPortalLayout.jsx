import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { CheckIcon, ClockIcon, DumbbellIcon, LogOutIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartImage } from "@/components/shared/SmartImage";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync } from "@/hooks";
import { cn } from "@/lib/utils";
import "./portal-paper.css";

const NAV_ITEMS = [
    { to: "/portal", label: "Home", end: true },
    { to: "/portal/attendance", label: "Attendance" },
    { to: "/portal/payments", label: "Payments" },
    { to: "/portal/password", label: "Password" },
];
/** A visit counts at most 12h so a forgotten check-out cannot skew totals. */
const MAX_VISIT_MS = 12 * 3_600_000;
const pad2 = (value) => String(value).padStart(2, "0");
function ymdLocal(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
/** `73800000` → `20h 30m`, `185000` → `3m 05s`. */
function durationLabel(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0 ? `${hours}h ${pad2(minutes)}m` : `${minutes}m ${pad2(seconds)}s`;
}
function visitSpanMs(record, nowMs) {
    const start = new Date(record.checkIn).getTime();
    const end = record.checkOut ? new Date(record.checkOut).getTime() : nowMs;
    return Math.min(Math.max(0, end - start), MAX_VISIT_MS);
}
/**
 * Navbar pill: live timer while today's check-in is open, today's total once
 * checked out, otherwise the last visit's time. Flips to a warning ("Time up")
 * the moment the live time passes the member's planned hours per day.
 */
function SessionTimerPill({ plannedHours }) {
    const data = useData();
    const attendance = useAsync(() => data.listMyAttendance(10), [data]);
    const [tick, setTick] = useState(() => Date.now());
    const rows = attendance.data ?? [];
    const today = ymdLocal(new Date());
    const todayRows = useMemo(() => rows.filter((r) => ymdLocal(new Date(r.checkIn)) === today), [rows, today]);
    const openToday = todayRows.find((r) => r.status === "checked_in" && !r.checkOut);
    useEffect(() => {
        if (!openToday)
            return;
        const id = setInterval(() => setTick(Date.now()), 1000);
        return () => clearInterval(id);
    }, [openToday]);
    if (!attendance.loading && rows.length === 0)
        return null;
    let label = null;
    let warning = false;
    if (openToday) {
        const ms = visitSpanMs(openToday, tick);
        warning = Boolean(plannedHours) && ms > plannedHours * 3_600_000;
        label = warning ? `Time up · ${durationLabel(ms)}` : `In gym · ${durationLabel(ms)}`;
    }
    else if (todayRows.length > 0) {
        const ms = todayRows.reduce((sum, r) => sum + visitSpanMs(r, tick), 0);
        label = `Today · ${durationLabel(ms)}`;
    }
    else if (rows.length > 0) {
        const last = rows.find((r) => r.checkOut) ?? rows[0];
        label = `Last visit · ${durationLabel(visitSpanMs(last, tick))}`;
    }
    else {
        return null;
    }
    return (<span title={plannedHours ? `Planned gym time: ${plannedHours}h per day` : "Time spent at the gym"} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums", warning
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border/70 bg-secondary text-muted-foreground")}>
      <ClockIcon className="size-3"/>{label}
    </span>);
}
/** Staff-sent / automatic reminders (e.g. "your planned time is over"). */
function ReminderBanner() {
    const data = useData();
    const reminders = useAsync(() => data.getMyReminders(), [data]);
    const [dismissing, setDismissing] = useState(false);
    const rows = reminders.data ?? [];
    if (rows.length === 0)
        return null;
    const dismiss = async () => {
        setDismissing(true);
        try {
            await data.readMyReminders();
            reminders.reload();
        }
        finally {
            setDismissing(false);
        }
    };
    return (<div role="status" className="border-b border-warning/30 bg-warning/10">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <TriangleAlertIcon className="size-4 shrink-0 text-warning"/>
        <p className="min-w-0 flex-1 text-xs sm:text-sm">
          <span className="font-semibold">{rows[0].title}</span>
          {" — "}
          {rows[0].body}
          {rows.length > 1 ? ` (+${rows.length - 1} more)` : ""}
        </p>
        <Button size="sm" variant="outline" className="h-7" disabled={dismissing} onClick={dismiss}>
          <CheckIcon className="size-3.5"/> Got it
        </Button>
      </div>
    </div>);
}
/**
 * Shell for the member self-service portal — deliberately NOT the staff
 * AppShell: no sidebar, no topbar, no capability-gated staff navigation.
 * The paper-craft stylesheet (portal-paper.css) is loaded once, here, so every
 * portal page can use the `pp-*` surfaces.
 */
export function MemberPortalLayout() {
    const { session, signOut } = useAuth();
    const data = useData();
    const navigate = useNavigate();
    const profile = session?.profile;
    const myProfile = useAsync(() => data.getMyMemberProfile(), [data]);
    const plannedHours = myProfile.data?.plannedHoursPerDay ?? null;
    const handleSignOut = async () => {
        await signOut();
        navigate("/login", { replace: true });
    };
    return (<div className="min-h-dvh bg-background">
      <ReminderBanner/>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <DumbbellIcon className="size-4"/>
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                {session?.gym?.name ?? "Pulse Gym Suite"}
              </p>
              <p className="truncate font-serif text-[11px] text-muted-foreground italic">Member portal</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <SessionTimerPill plannedHours={plannedHours}/>
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
