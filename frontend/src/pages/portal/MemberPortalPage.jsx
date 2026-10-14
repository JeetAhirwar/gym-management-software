import { useEffect, useState } from "react";
import { Skeleton, ErrorState } from "@/components/shared/States";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync } from "@/hooks";
import { renderQrDataUrl } from "@/lib/qr";
import { greetingForHour, computeVisitStats } from "./paper";
import { Settle, SectionHeading } from "./PaperBits";
import { MembershipPass } from "./MembershipPass";
import { StatsTickets } from "./StatsTickets";
import { ClassTickets } from "./ClassTickets";
import { VisitCalendar } from "./VisitCalendar";
import { ReceiptStubs } from "./ReceiptStubs";

export function MemberPortalPage() {
    const data = useData();
    const { session } = useAuth();
    const profile = useAsync(() => data.getMyMemberProfile(), [data]);
    const qr = useAsync(() => data.getMyQr(), [data]);
    const attendance = useAsync(() => data.listMyAttendance(60), [data]);
    const classes = useAsync(() => data.listMyClasses(), [data]);
    const payments = useAsync(() => data.listMyPayments(), [data]);
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const qrToken = qr.data?.token ?? null;
    useEffect(() => {
        let cancelled = false;
        setQrDataUrl(null);
        if (!qrToken)
            return;
        renderQrDataUrl(qrToken, { width: 360 })
            .then((url) => {
            if (!cancelled)
                setQrDataUrl(url);
        })
            .catch(() => {
            if (!cancelled)
                setQrDataUrl(null);
        });
        return () => {
            cancelled = true;
        };
    }, [qrToken]);

    const me = profile.data;
    const firstName = (me?.fullName ?? session?.profile.fullName ?? "").split(" ")[0] || "there";
    const now = new Date();
    const todayLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const stats = computeVisitStats(attendance.data ?? []);
    const days = me?.daysRemaining ?? null;

    return (<div className="space-y-10 pb-6">
      {/* ---------- greeting ---------- */}
      <Settle>
        <header className="relative">
          <p className="font-serif text-sm tracking-wide text-muted-foreground italic">{todayLabel}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {greetingForHour(now.getHours())},{" "}
            <span className="font-serif italic">{firstName}</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Your pass, visits and sessions — pressed onto one sheet of paper.
          </p>
          {me?.memberCode ? (<span aria-hidden="true" className="paper-surface paper-lift absolute top-0 right-0 hidden rotate-[6deg] rounded-md px-2.5 py-1 font-mono text-[10px] tracking-[0.2em] uppercase shadow-md sm:block">
              Member {me.memberCode}
            </span>) : null}
        </header>
      </Settle>

      {/* ---------- hero: 3D membership pass ---------- */}
      <Settle delay={0.08} rotate={0}>
        <section aria-labelledby="pass-heading" className="space-y-3">
          <SectionHeading title={<span id="pass-heading">Your membership pass</span>}/>
          {profile.error && !me ? (<ErrorState title="Unable to load your profile" message={profile.error} onRetry={profile.reload}/>) : (<MembershipPass profile={me} qr={qr} qrDataUrl={qrDataUrl}/>)}
        </section>
      </Settle>

      {/* ---------- stats tickets ---------- */}
      <Settle delay={0.16}>
        <section aria-label="Your numbers at a glance">
          <StatsTickets items={[
            { label: "Visits this month", value: attendance.loading && !attendance.data ? "…" : stats.thisMonth, sub: "since the 1st" },
            { label: "Visit streak", value: attendance.loading && !attendance.data ? "…" : stats.streak, sub: stats.streak === 1 ? "day in a row" : "days in a row" },
            { label: "Total visits", value: attendance.loading && !attendance.data ? "…" : stats.total, sub: "on record" },
            { label: "Days remaining", value: profile.loading && !me ? "…" : days === null ? "—" : Math.max(0, days), sub: days !== null && days <= 0 ? "renew at the desk" : "on your plan" },
        ]}/>
          {attendance.error && !attendance.data ? (<p className="mt-3 text-xs text-muted-foreground">
              Visit stats unavailable — <button type="button" onClick={attendance.reload} className="underline underline-offset-4 hover:text-foreground">retry</button>
            </p>) : null}
        </section>
      </Settle>

      {/* ---------- classes: boarding passes ---------- */}
      <Settle delay={0.24}>
        <section aria-labelledby="classes-heading" className="space-y-3">
          <SectionHeading title={<span id="classes-heading">My classes</span>}/>
          <ClassTickets classes={classes}/>
        </section>
      </Settle>

      {/* ---------- calendar + receipts ---------- */}
      <Settle delay={0.32}>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section aria-labelledby="calendar-heading" className="space-y-3">
            <SectionHeading title={<span id="calendar-heading">Visit calendar</span>}/>
            {attendance.loading && !attendance.data ? (<Skeleton className="h-96 rounded-xl"/>) : attendance.error && !attendance.data ? (<ErrorState title="Unable to load your visits" message={attendance.error} onRetry={attendance.reload}/>) : (<VisitCalendar records={attendance.data ?? []}/>)}
          </section>

          <section aria-labelledby="payments-heading" className="space-y-3">
            <SectionHeading title={<span id="payments-heading">Recent payments</span>}/>
            <ReceiptStubs payments={payments} linkTo="/portal/payments"/>
          </section>
        </div>
      </Settle>
    </div>);
}
