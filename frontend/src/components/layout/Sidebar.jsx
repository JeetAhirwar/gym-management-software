import { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { BarChart3Icon, Building2Icon, CalendarCheckIcon, CalendarDaysIcon, CreditCardIcon, DumbbellIcon, LayoutDashboardIcon, MenuIcon, SettingsIcon, TagsIcon, UsersIcon, UserSquare2Icon, XIcon, } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { can } from "@/lib/permissions";
export const NAV_ITEMS = [
    { to: "/", label: "Dashboard", icon: LayoutDashboardIcon, end: true },
    { to: "/members", label: "Members", icon: UsersIcon, capability: "members.view" },
    { to: "/attendance/view", label: "View Attendance", icon: CalendarCheckIcon, capability: "attendance.view", end: true },
    { to: "/plans", label: "Membership Plans", icon: TagsIcon, capability: "plans.view" },
    { to: "/payments", label: "Payments & Fees", icon: CreditCardIcon, capability: "payments.view" },
    { to: "/staff", label: "Trainers & Staff", icon: UserSquare2Icon, capability: "staff.view" },
    { to: "/classes", label: "Classes & Schedule", icon: CalendarDaysIcon, capability: "classes.view" },
    { to: "/reports", label: "Reports & Analytics", icon: BarChart3Icon, capability: "reports.view" },
    { to: "/notifications", label: "Notifications", icon: DumbbellIcon, capability: "notifications.view" },
    { to: "/manage-gym", label: "Manage Gym", icon: Building2Icon, capability: "settings.manage", end: true },
    { to: "/settings", label: "Settings", icon: SettingsIcon, capability: "settings.view" },
];
export function SidebarContent({ onNavigate }) {
    const { session } = useAuth();
    const role = session?.profile.role;
    const location = useLocation();
    const items = useMemo(() => NAV_ITEMS.filter((item) => !item.capability || can(role, item.capability)), [role]);
    return (<div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_rgba(212,242,60,0.9)]">
          <DumbbellIcon className="size-5"/>
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">Pulse Gym Suite</p>
          <p className="truncate text-xs text-muted-foreground">{session?.gym.name ?? "Gym management"}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Primary">
        {items.map((item) => {
            const active = item.activeWhen
                ? item.activeWhen.includes(location.pathname)
                : item.end
                    ? location.pathname === item.to
                    : location.pathname.startsWith(item.to);
            return (<NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={cn("group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring", active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground")} aria-current={active ? "page" : "false"}>
              <item.icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}/>
              <span className="truncate font-medium">{item.label}</span>
              {active ? <span className="ml-auto size-1.5 rounded-full bg-primary" aria-hidden/> : null}
            </NavLink>);
        })}
      </nav>

      <div className="border-t border-border/60 px-5 py-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground/80">Pulse Gym Suite v1.0</p>
        <p className="mt-0.5">QR attendance · memberships · payments</p>
      </div>
    </div>);
}
export function MobileSidebar({ open, onClose }) {
    return (<div className={cn("fixed inset-0 z-50 lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
      <div onClick={onClose} className={cn("absolute inset-0 bg-black/60 transition-opacity", open ? "opacity-100" : "opacity-0")}/>
      <aside className={cn("absolute inset-y-0 left-0 w-72 border-r border-border bg-sidebar transition-transform duration-200", open ? "translate-x-0" : "-translate-x-full")}>
        <button type="button" onClick={onClose} aria-label="Close navigation" className="absolute top-4 right-4 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <XIcon className="size-4"/>
        </button>
        <SidebarContent onNavigate={onClose}/>
      </aside>
    </div>);
}
export { MenuIcon };
