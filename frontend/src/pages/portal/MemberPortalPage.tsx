import { useEffect, useState } from "react";
import { CalendarDaysIcon, QrCodeIcon, UserRoundIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton, EmptyState, ErrorState } from "@/components/shared/States";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync } from "@/hooks";
import { durationLabel, formatDate } from "@/lib/format";
import { renderQrDataUrl, tokenHint } from "@/lib/qr";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function MemberPortalPage() {
  const data = useData();
  const { session } = useAuth();
  const profile = useAsync(() => data.getMyMemberProfile(), [data]);
  const qr = useAsync(() => data.getMyQr(), [data]);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const qrToken = qr.data?.token ?? null;
  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    if (!qrToken) return;
    // Same rendering path as the staff QR card — payload carries only the opaque token.
    renderQrDataUrl(qrToken, { width: 360 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  const me = profile.data;
  const firstName = (me?.fullName ?? session?.profile.fullName ?? "").split(" ")[0] || "there";
  const membership = me?.membership ?? null;
  const days = me?.daysRemaining ?? null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {greetingForHour(new Date().getHours())}, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Your membership, check-in QR and visits — all in one place.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* QR card */}
        <Card className="graphite-surface border-border/70">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Check-in QR</CardTitle>
              <p className="text-xs text-muted-foreground">Show this at the front desk</p>
            </div>
            <QrCodeIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            {qr.error ? (
              <div className="w-full">
                <ErrorState title="Unable to load your QR code" message={qr.error} onRetry={qr.reload} />
              </div>
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Your membership QR code"
                className="size-56 rounded-lg bg-white p-2"
              />
            ) : (
              <Skeleton className="size-56 rounded-lg" />
            )}

            <div className="space-y-1 text-center">
              <p className="text-sm font-medium">{me?.fullName ?? session?.profile.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {me?.memberCode ?? "—"}
                {membership?.planName ? ` · ${membership.planName}` : ""}
              </p>
              {qr.data ? (
                <p className="font-mono text-[11px] tracking-wide text-muted-foreground">
                  Token {tokenHint(qr.data.token)}
                </p>
              ) : null}
            </div>

            {qr.data?.status === "revoked" ? (
              <p className="text-center text-xs text-destructive">
                This QR was revoked — please ask the front desk for a new card.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Membership + identity */}
        <div className="space-y-4">
          {profile.error && !me ? (
            <ErrorState
              title="Unable to load your profile"
              message={profile.error}
              onRetry={profile.reload}
            />
          ) : profile.loading && !me ? (
            <div className="space-y-3">
              <Skeleton className="h-52" />
              <Skeleton className="h-32" />
            </div>
          ) : me ? (
            <>
              <Card className="graphite-surface border-border/70">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">Membership</CardTitle>
                    <p className="text-xs text-muted-foreground">Live plan and validity</p>
                  </div>
                  <StatusBadge status={me.effectiveStatus} />
                </CardHeader>
                <CardContent>
                  {membership ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs tracking-wide text-muted-foreground uppercase">Plan</p>
                        <p className="mt-1 text-lg font-semibold tracking-tight">
                          {membership.planName ?? "Plan"}
                        </p>
                        {membership.planDurationValue && membership.planDurationUnit ? (
                          <p className="text-xs text-muted-foreground">
                            {durationLabel(membership.planDurationValue, membership.planDurationUnit)}
                          </p>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs tracking-wide text-muted-foreground uppercase">Start</p>
                          <p className="mt-1 text-sm font-medium">{formatDate(membership.startDate)}</p>
                        </div>
                        <div>
                          <p className="text-xs tracking-wide text-muted-foreground uppercase">End</p>
                          <p className="mt-1 text-sm font-medium">{formatDate(membership.endDate)}</p>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/70 bg-secondary/40 px-4 py-3">
                        <p className="text-3xl font-semibold tabular-nums tracking-tight">
                          {days === null ? "—" : days <= 0 ? "0" : days}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {days === null
                            ? "Days remaining unavailable"
                            : days <= 0
                              ? "Membership expired — renew at the front desk"
                              : days === 1
                                ? "day left"
                                : "days left"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={<CalendarDaysIcon className="size-5" />}
                      title="No membership yet"
                      description="Visit the front desk to get a plan assigned — it will appear here as soon as it is active."
                      className="py-8"
                    />
                  )}
                </CardContent>
              </Card>

              <Card className="graphite-surface border-border/70">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">My details</CardTitle>
                    <p className="text-xs text-muted-foreground">On file with the gym</p>
                  </div>
                  <UserRoundIcon className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">Member code</p>
                    <p className="mt-1">
                      <Badge variant="secondary">{me.memberCode}</Badge>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">Joined</p>
                    <p className="mt-1 text-sm font-medium">{formatDate(me.joinDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">Phone</p>
                    <p className="mt-1 text-sm font-medium">{me.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">Email</p>
                    <p className="mt-1 truncate text-sm font-medium">{me.email || "—"}</p>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
