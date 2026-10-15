import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, } from "recharts";
import { motion } from "motion/react";
import { ActivityIcon, BanknoteIcon, CalendarClockIcon, CameraIcon, IndianRupeeIcon, PlusIcon, UserPlusIcon, UserRoundCheckIcon, WalletIcon, } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, Skeleton, Stagger } from "@/components/shared/States";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SmartImage } from "@/components/shared/SmartImage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync } from "@/hooks";
import { formatINR, formatDate, formatTime, relativeTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
function CountUp({ value, format }) {
    const [display, setDisplay] = useState(0);
    const previous = useRef(0);
    useEffect(() => {
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (reduceMotion) {
            setDisplay(value);
            previous.current = value;
            return;
        }
        const from = previous.current;
        const start = performance.now();
        const duration = 650;
        let frame = 0;
        const tick = (now) => {
            const progress = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(from + (value - from) * eased));
            if (progress < 1)
                frame = requestAnimationFrame(tick);
            else
                previous.current = value;
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [value]);
    return <span className="tabular">{format ? format(display) : display.toLocaleString("en-IN")}</span>;
}
function StatCard({ label, value, icon, hint, tone = "default", format, }) {
    const toneClass = tone === "success"
        ? "text-primary"
        : tone === "warning"
            ? "text-warning"
            : tone === "danger"
                ? "text-destructive"
                : "text-foreground";
    return (<Card className="graphite-surface border-border/70">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
          <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            {icon}
          </span>
        </div>
        <p className={cn("mt-4 text-3xl font-semibold tracking-tight", toneClass)}>
          <CountUp value={value} format={format}/>
        </p>
        {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>);
}
function ChartTooltipCard({ active, payload, label, isCurrency }) {
    if (!active || !payload || payload.length === 0)
        return null;
    return (<div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((entry, index) => (<p key={index} className="text-muted-foreground">
          {entry.name}:{" "}
          <span className="font-medium text-foreground">
            {isCurrency ? formatINR(Number(entry.value)) : Number(entry.value).toLocaleString("en-IN")}
          </span>
        </p>))}
    </div>);
}
export function DashboardPage() {
    const data = useData();
    const { session } = useAuth();
    const role = session?.profile.role;
    const stats = useAsync(() => data.getDashboardStats(), [data]);
    const trend = useAsync(() => data.getAttendanceTrend(14), [data]);
    const revenue = useAsync(() => data.getRevenueTrend(6), [data]);
    const distribution = useAsync(() => data.getPlanDistribution(), [data]);
    const recentCheckIns = useAsync(() => data.getRecentCheckIns(6), [data]);
    const recentMembers = useAsync(() => data.getRecentMembers(5), [data]);
    const expirations = useAsync(() => data.getUpcomingExpiries(5), [data]);
    const isNewGym = stats.data?.totalMembers === 0;
    const revenueDelta = stats.data && stats.data.previousMonthRevenue > 0
        ? Math.round(((stats.data.monthlyRevenue - stats.data.previousMonthRevenue) / stats.data.previousMonthRevenue) * 100)
        : null;
    const quickActions = [
        { to: "/members?new=1", label: "Add member", icon: UserPlusIcon, capability: "members.create" },
        { to: "/attendance", label: "Scan QR", icon: CameraIcon, capability: "qr.scan" },
        { to: "/payments?new=1", label: "Record payment", icon: WalletIcon, capability: "payments.record" },
        { to: "/plans?new=1", label: "Add plan", icon: PlusIcon, capability: "plans.manage" },
    ].filter((action) => can(role, action.capability));
    if (stats.loading) {
        return (<div className="space-y-6">
        <Skeleton className="h-20 w-full"/>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (<Skeleton key={index} className="h-32"/>))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72"/>
          <Skeleton className="h-72"/>
        </div>
      </div>);
    }
    if (stats.error) {
        return <ErrorState message={stats.error} onRetry={stats.reload} title="Unable to load the dashboard"/>;
    }
    return (<div className="space-y-6">
      <PageHeader title={`Welcome back, ${session?.profile.fullName.split(" ")[0] ?? "there"}`} description={isNewGym
            ? "Your database is ready — add your first plan and member to see live numbers here."
            : "Here is what is happening at your gym today."} actions={<>
            <Button variant="outline" asChild>
              <Link to="/reports">
                <ActivityIcon className="size-4"/> View reports
              </Link>
            </Button>
            {quickActions.slice(0, 1).map((action) => (<Button key={action.to} asChild>
                <Link to={action.to}>
                  <action.icon className="size-4"/> {action.label}
                </Link>
              </Button>))}
          </>}/>

      {isNewGym ? (<Stagger>
          <Card className="paper-surface paper-lift relative overflow-hidden border-0">
            <span className="paper-tape" aria-hidden/>
            <CardContent className="p-8">
              <div className="max-w-2xl">
                <p className="font-serif text-sm tracking-wide text-paper-foreground/70">Getting started</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Three steps to a live gym</h2>
                <ol className="mt-5 space-y-4">
                  {[
                ["Create membership plans", "Set prices and durations in ₹ — Monthly, Quarterly, Annual.", "/plans?new=1"],
                ["Add your first member", "Their QR membership card is generated automatically.", "/members?new=1"],
                ["Open the QR scanner", "Check members in from any phone with a camera.", "/attendance"],
            ].map(([title, description, to]) => (<li key={title} className="flex gap-4">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-paper-foreground text-xs font-bold text-paper">
                        {["1", "2", "3"][["Create membership plans", "Add your first member", "Open the QR scanner"].indexOf(title)]}
                      </span>
                      <div>
                        <Link to={to} className="font-medium underline-offset-4 hover:underline">
                          {title}
                        </Link>
                        <p className="text-sm text-paper-foreground/70">{description}</p>
                      </div>
                    </li>))}
                </ol>
              </div>
            </CardContent>
          </Card>
        </Stagger>) : null}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stagger delayIndex={0}>
          <StatCard label="Active members" value={stats.data?.activeMembers ?? 0} icon={<UserRoundCheckIcon className="size-4"/>} hint={`${stats.data?.totalMembers ?? 0} total on record`} tone="success"/>
        </Stagger>
        <Stagger delayIndex={1}>
          <StatCard label="New this month" value={stats.data?.newThisMonth ?? 0} icon={<UserPlusIcon className="size-4"/>} hint="Joined in the current month"/>
        </Stagger>
        <Stagger delayIndex={2}>
          <StatCard label="Expiring soon" value={stats.data?.expiringSoon ?? 0} icon={<CalendarClockIcon className="size-4"/>} hint={`${stats.data?.expiredMembers ?? 0} already expired`} tone="warning"/>
        </Stagger>
        <Stagger delayIndex={3}>
          <StatCard label="Today's check-ins" value={stats.data?.todayAttendance ?? 0} icon={<CameraIcon className="size-4"/>} hint={session && data
            ? `${stats.data?.currentCheckIns ?? 0} currently inside`
            : undefined} tone="default"/>
        </Stagger>
      </div>

{/* This month: Total | Collected | Remaining */}
<div className="grid gap-4 sm:grid-cols-3">
  <Stagger delayIndex={4}>
    <StatCard
      label="Total this month"
      value={(stats.data?.monthlyRevenue ?? 0) + (stats.data?.pendingAmount ?? 0)}
      format={(n) => formatINR(n)}
      icon={<IndianRupeeIcon className="size-4" />}
      hint="Collected + remaining"
    />
  </Stagger>
  <Stagger delayIndex={5}>
    <StatCard
      label="Collected"
      value={stats.data?.monthlyRevenue ?? 0}
      format={(n) => formatINR(n)}
      icon={<BanknoteIcon className="size-4" />}
      hint={
        revenueDelta !== null
          ? `${revenueDelta >= 0 ? "+" : ""}${revenueDelta}% vs last month`
          : "Payments received this month"
      }
      tone="success"
    />
  </Stagger>
  <Stagger delayIndex={6}>
    <StatCard
      label="Remaining"
      value={stats.data?.pendingAmount ?? 0}
      format={(n) => formatINR(n)}
      icon={<WalletIcon className="size-4" />}
      hint={
        stats.data?.pendingPayments
          ? `${stats.data.pendingPayments} member${stats.data.pendingPayments === 1 ? "" : "s"} with dues`
          : "No outstanding dues"
      }
      tone={stats.data && (stats.data.pendingAmount ?? 0) > 0 ? "danger" : "default"}
    />
  </Stagger>
</div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="graphite-surface border-border/70 lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Attendance trend</CardTitle>
              <p className="text-xs text-muted-foreground">Daily check-ins, last 14 days</p>
            </div>
            <Link to="/reports" className="text-xs text-primary hover:underline">
              Full report
            </Link>
          </CardHeader>
          <CardContent className="h-64 pb-4">
            {trend.loading ? (<Skeleton className="size-full"/>) : trend.data ? (<ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend.data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35}/>
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={18}/>
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={40}/>
                  <Tooltip content={<ChartTooltipCard />} cursor={{ stroke: "var(--border)" }}/>
                  <Area type="monotone" dataKey="count" name="Check-ins" stroke="var(--chart-1)" strokeWidth={2} fill="url(#attendanceFill)"/>
                </AreaChart>
              </ResponsiveContainer>) : null}
          </CardContent>
        </Card>

        <Card className="graphite-surface border-border/70">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Plan mix</CardTitle>
              <p className="text-xs text-muted-foreground">Active memberships</p>
            </div>
          </CardHeader>
          <CardContent className="h-64 pb-4">
            {distribution.loading ? (<Skeleton className="size-full"/>) : distribution.data && distribution.data.some((d) => d.count > 0) ? (<ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distribution.data.filter((d) => d.count > 0)} dataKey="count" nameKey="planName" innerRadius={52} outerRadius={80} paddingAngle={3} stroke="none">
                    {distribution.data
                .filter((d) => d.count > 0)
                .map((entry, index) => (<Cell key={entry.planId} fill={CHART_COLORS[index % CHART_COLORS.length]}/>))}
                  </Pie>
                  <Tooltip content={<ChartTooltipCard />}/>
                </PieChart>
              </ResponsiveContainer>) : (<EmptyState title="No active memberships yet" description="Assign a plan to a member to see the mix." className="h-full py-6"/>)}
            {distribution.data && distribution.data.some((d) => d.count > 0) ? (<ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {distribution.data.filter((d) => d.count > 0).slice(0, 4).map((entry, index) => (<li key={entry.planId} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}/>
                    {entry.planName} · {entry.count}
                  </li>))}
              </ul>) : null}
          </CardContent>
        </Card>
      </div>

      {/* Revenue chart + lists */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="graphite-surface border-border/70 lg:col-span-1">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Monthly revenue</CardTitle>
            <p className="text-xs text-muted-foreground">Last 6 months (INR)</p>
          </CardHeader>
          <CardContent className="h-64 pb-4">
            {revenue.loading ? (<Skeleton className="size-full"/>) : revenue.data ? (<ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenue.data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={44}/>
                  <Tooltip content={<ChartTooltipCard isCurrency/>} cursor={{ fill: "var(--accent)" }}/>
                  <Bar dataKey="revenue" name="Revenue" fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={36}/>
                </BarChart>
              </ResponsiveContainer>) : null}
          </CardContent>
        </Card>

        <Card className="graphite-surface border-border/70">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent check-ins</CardTitle>
            <Link to="/attendance/history" className="text-xs text-primary hover:underline">
              History
            </Link>
          </CardHeader>
          <CardContent>
            {recentCheckIns.loading ? (<div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12"/>)}</div>) : (recentCheckIns.data ?? []).length === 0 ? (<EmptyState title="No check-ins yet" description="Scan a member QR to record the first visit." className="py-8"/>) : (<ul className="divide-y divide-border/60">
                {(recentCheckIns.data ?? []).map((record, index) => (<motion.li key={record.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.04, duration: 0.25 }} className="flex items-center gap-3 py-2.5">
                    <SmartImage src={record.memberPhoto} name={record.memberName ?? "Member"} className="size-9"/>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{record.memberName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {record.memberCode} · {formatTime(record.checkIn)}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", record.status === "checked_out" ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary")}>
                      {record.status === "checked_out" ? "Checked out" : "In gym"}
                    </span>
                  </motion.li>))}
              </ul>)}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="graphite-surface border-border/70">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">New members</CardTitle>
              <Link to="/members" className="text-xs text-primary hover:underline">
                All members
              </Link>
            </CardHeader>
            <CardContent>
              {recentMembers.loading ? (<div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10"/>)}</div>) : (recentMembers.data ?? []).length === 0 ? (<EmptyState title="No members yet" description="Add your first member to get started." className="py-6"/>) : (<ul className="space-y-2.5">
                  {(recentMembers.data ?? []).map((member) => (<li key={member.id} className="flex items-center gap-3">
                      <SmartImage src={member.photoUrl} name={member.fullName} className="size-8"/>
                      <div className="min-w-0 flex-1">
                        <Link to={`/members/${member.id}`} className="truncate text-sm font-medium hover:underline">
                          {member.fullName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {member.memberCode} · joined {formatDate(member.joinDate)}
                        </p>
                      </div>
                      <StatusBadge status={member.effectiveStatus}/>
                    </li>))}
                </ul>)}
            </CardContent>
          </Card>

          <Card className="graphite-surface border-border/70">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Expiring soon</CardTitle>
            </CardHeader>
            <CardContent>
              {expirations.loading ? (<div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10"/>)}</div>) : (expirations.data ?? []).length === 0 ? (<EmptyState title="Nothing expiring" description="Memberships ending soon will appear here." className="py-6"/>) : (<ul className="space-y-2.5">
                  {(expirations.data ?? []).map((member) => (<li key={member.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <Link to={`/members/${member.id}`} className="truncate text-sm font-medium hover:underline">
                          {member.fullName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {member.planName} · ends {formatDate(member.endDate)} · {relativeTime(member.endDate)}
                        </p>
                      </div>
                      <StatusBadge status={member.effectiveStatus}/>
                    </li>))}
                </ul>)}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>);
}
