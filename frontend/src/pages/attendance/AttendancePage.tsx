import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import {
  CameraIcon,
  CameraOffIcon,
  HistoryIcon,
  Loader2Icon,
  LockIcon,
  LogInIcon,
  LogOutIcon,
  QrCodeIcon,
  RefreshCwIcon,
  VideoOffIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, Skeleton, Stagger } from "@/components/shared/States";
import { SmartImage } from "@/components/shared/SmartImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync, useSubmitGuard } from "@/hooks";
import { formatDateTime, formatTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { parseQrPayload } from "@/lib/qr";
import { manualCheckInSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import type { AttendanceRecord, CheckInResult } from "@/types";
import { CameraScanner, type ScannerStatus } from "./CameraScanner";
import { CheckInResultPanel } from "./CheckInResultPanel";
import { ScanFeed, type FeedEntry } from "./ScanFeed";
import { METHOD_LABELS, REJECTION_LABELS, toRejection } from "./labels";

/** html5-qrcode keeps firing for a code held in frame — ignore repeats this fast. */
const SCAN_DEDUPE_MS = 3_000;
/** Let the front desk read the verdict before focus jumps back to the input. */
const REFOCUS_DELAY_MS = 1_500;
/** Entries kept in the live feed. */
const FEED_LIMIT = 10;
/** History rows pulled once to pre-fill the feed. */
const FEED_SEED_SIZE = 8;
/** Rows requested for the "Live now" card. */
const LIVE_NOW_PAGE_SIZE = 20;

const INVALID_QR_MESSAGE =
  "That does not look like a Pulse Gym membership QR. Ask the front desk for a valid card.";

type ManualCheckInValues = z.infer<typeof manualCheckInSchema>;

function timeOf(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Newest first, de-duplicated by key, capped at `FEED_LIMIT`. */
function mergeFeed(incoming: FeedEntry[], existing: FeedEntry[]): FeedEntry[] {
  const keys = new Set(incoming.map((entry) => entry.key));
  return [...incoming, ...existing.filter((entry) => !keys.has(entry.key))]
    .sort((a, b) => timeOf(b.at) - timeOf(a.at))
    .slice(0, FEED_LIMIT);
}

function recordToEntry(record: AttendanceRecord): FeedEntry {
  return {
    key: record.id,
    at: record.checkIn,
    ok: true,
    title: record.memberName ?? "Member",
    subtitle: [record.memberCode, METHOD_LABELS[record.method]].filter(Boolean).join(" · "),
  };
}

function resultToEntry(result: CheckInResult, key: string): FeedEntry {
  if (result.status === "ok") {
    return {
      key,
      at: result.attendance.checkIn,
      ok: true,
      title: result.member.fullName,
      subtitle: [result.member.memberCode, METHOD_LABELS[result.attendance.method]]
        .filter(Boolean)
        .join(" · "),
    };
  }
  return {
    key,
    at: new Date().toISOString(),
    ok: false,
    title: REJECTION_LABELS[result.reason],
    subtitle: result.message,
  };
}

function StatusDot({ tone }: { tone: "ok" | "danger" | "muted" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        tone === "ok" && "animate-pulse bg-primary",
        tone === "danger" && "bg-destructive",
        tone === "muted" && "bg-muted-foreground",
      )}
    />
  );
}

function LiveNowRow({
  record,
  trackCheckout,
  busy,
  onCheckout,
}: {
  record: AttendanceRecord;
  trackCheckout: boolean;
  busy: boolean;
  onCheckout: (record: AttendanceRecord) => void;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <SmartImage src={record.memberPhoto} name={record.memberName ?? "Member"} className="size-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{record.memberName ?? "Member"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[record.memberCode, `in ${formatTime(record.checkIn)}`].filter(Boolean).join(" · ")}
        </p>
      </div>
      {trackCheckout ? (
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => onCheckout(record)}
          aria-label={`Check out ${record.memberName ?? "member"}`}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />}
          Check out
        </Button>
      ) : (
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
          Inside
        </Badge>
      )}
    </li>
  );
}

export function AttendancePage() {
  const data = useData();
  const { session } = useAuth();
  const canScan = can(session?.profile.role, "qr.scan");

  const [scannerStatus, setScannerStatus] = useState<ScannerStatus>({ state: "idle" });
  const [cameraActive, setCameraActive] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [sequence, setSequence] = useState(0);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

  const liveNow = useAsync(
    () => data.listAttendance({ status: "checked_in", pageSize: LIVE_NOW_PAGE_SIZE }),
    [data],
  );
  const settings = useAsync(() => data.getSettings(), [data]);
  const seed = useAsync(() => data.listAttendance({ pageSize: FEED_SEED_SIZE }), [data]);

  const [manualSubmitting, runManual] = useSubmitGuard();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ManualCheckInValues>({
    resolver: zodResolver(manualCheckInSchema),
    defaultValues: { memberCode: "" },
  });
  const manualField = register("memberCode");

  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const refocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScanRef = useRef<{ text: string; at: number } | null>(null);
  const feedKeyRef = useRef(0);
  const seededRef = useRef(false);

  const scheduleRefocus = useCallback((delay: number) => {
    if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
    refocusTimerRef.current = setTimeout(() => {
      refocusTimerRef.current = null;
      const input = manualInputRef.current;
      input?.focus();
      input?.select();
    }, delay);
  }, []);

  // Never leak the refocus timer across unmount.
  useEffect(
    () => () => {
      if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
    },
    [],
  );

  // Pre-fill the feed with recent history exactly once.
  useEffect(() => {
    if (seededRef.current || !seed.data) return;
    seededRef.current = true;
    const seeded = seed.data.items.map(recordToEntry);
    setEntries((prev) => mergeFeed(prev, seeded));
  }, [seed.data]);

  const statusState = scannerStatus.state;
  // A dead camera should hand the operator straight to manual entry.
  useEffect(() => {
    if (statusState === "error") scheduleRefocus(0);
  }, [statusState, scheduleRefocus]);

  const nextKey = (prefix: string): string => {
    feedKeyRef.current += 1;
    return `${prefix}-${feedKeyRef.current}`;
  };

  const applyResult = (next: CheckInResult, source: "qr" | "manual") => {
    setResult(next);
    setSequence((value) => value + 1);
    setEntries((prev) => mergeFeed([resultToEntry(next, nextKey("scan"))], prev));
    if (next.status === "ok") {
      liveNow.reload();
      if (source === "manual") reset({ memberCode: "" });
      toast.success(`${next.member.fullName} checked in`, {
        description: [
          next.member.memberCode,
          formatDateTime(next.attendance.checkIn),
          next.warning,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } else {
      toast.error(REJECTION_LABELS[next.reason], { description: next.message });
    }
    scheduleRefocus(REFOCUS_DELAY_MS);
  };

  const handleDecoded = (rawText: string) => {
    const now = Date.now();
    const last = lastScanRef.current;
    if (last && last.text === rawText && now - last.at < SCAN_DEDUPE_MS) return;
    lastScanRef.current = { text: rawText, at: now };

    const token = parseQrPayload(rawText);
    if (!token) {
      // Not a Pulse Gym payload — reject locally, never hit the service.
      applyResult({ status: "rejected", reason: "invalid_qr", message: INVALID_QR_MESSAGE }, "qr");
      return;
    }
    void (async () => {
      try {
        applyResult(await data.checkInByToken(token, { method: "qr" }), "qr");
      } catch (error) {
        applyResult(toRejection(error), "qr");
      }
    })();
  };

  const onManualSubmit = handleSubmit((values) => {
    void runManual(async () => {
      try {
        applyResult(
          await data.checkInByMemberCode(values.memberCode, { method: "manual" }),
          "manual",
        );
      } catch (error) {
        applyResult(toRejection(error), "manual");
      }
    });
  });

  const handleCheckout = async (record: AttendanceRecord): Promise<void> => {
    if (checkingOutId) return;
    setCheckingOutId(record.id);
    try {
      const updated = await data.recordCheckout(record.id);
      const name = record.memberName ?? "Member";
      toast.success(`${name} checked out`, { description: formatDateTime(updated.checkOut) });
      setEntries((prev) =>
        mergeFeed(
          [
            {
              key: nextKey("checkout"),
              at: updated.checkOut ?? new Date().toISOString(),
              ok: true,
              title: `${name} checked out`,
              subtitle: record.memberCode,
            },
          ],
          prev,
        ),
      );
      liveNow.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to record the check-out.");
    } finally {
      setCheckingOutId(null);
    }
  };

  const startCamera = () => {
    setAttempt((value) => value + 1);
    setCameraActive(true);
  };

  const trackCheckout = settings.data?.trackCheckout ?? false;
  const liveItems = liveNow.data?.items ?? [];
  const liveTotal = liveNow.data?.total ?? liveItems.length;

  const statusTone: "ok" | "danger" | "muted" =
    statusState === "scanning" ? "ok" : statusState === "error" ? "danger" : "muted";
  let statusText = "Camera is off";
  if (scannerStatus.state === "scanning") {
    statusText = `Scanning · ${scannerStatus.cameraLabel}`;
  } else if (statusState === "starting") {
    statusText = "Starting the camera…";
  } else if (statusState === "error") {
    statusText = "Camera unavailable — check in manually below";
  }

  const scannerConsole = (
    <div className="space-y-4">
      <Card className="graphite-surface border-border/70">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div className="min-w-0 space-y-1.5">
            <CardTitle className="text-base">Camera scanner</CardTitle>
            <p
              className={cn(
                "flex items-center gap-2 truncate text-xs",
                statusTone === "ok" && "text-primary",
                statusTone === "danger" && "text-destructive",
                statusTone === "muted" && "text-muted-foreground",
              )}
            >
              <StatusDot tone={statusTone} />
              {statusText}
            </p>
          </div>
          <Button
            size="sm"
            variant={cameraActive ? "outline" : "default"}
            onClick={() => (cameraActive ? setCameraActive(false) : startCamera())}
          >
            {cameraActive ? <VideoOffIcon /> : <CameraIcon />}
            {cameraActive ? "Stop camera" : "Start camera"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative mx-auto w-full max-w-md">
            <CameraScanner
              active={cameraActive}
              attempt={attempt}
              onDecoded={handleDecoded}
              onStatus={setScannerStatus}
            />
            {statusState === "error" ? (
              <div
                role="alert"
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/90 p-5 text-center backdrop-blur-sm"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <CameraOffIcon className="size-5" />
                </span>
                <p className="max-w-xs text-sm text-muted-foreground">{scannerStatus.message}</p>
                <Button size="sm" variant="outline" onClick={() => setAttempt((v) => v + 1)}>
                  <RefreshCwIcon /> Try camera again
                </Button>
              </div>
            ) : !cameraActive ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/85 p-5 text-center backdrop-blur-sm">
                <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <QrCodeIcon className="size-5" />
                </span>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Camera is off. Turn it on to scan member QR codes.
                </p>
                <Button size="sm" onClick={startCamera}>
                  <CameraIcon /> Start camera
                </Button>
              </div>
            ) : statusState === "starting" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/80 text-center">
                <span className="size-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Starting the camera…</p>
              </div>
            ) : null}
          </div>

          {/* Manual entry is always available, camera or no camera. */}
          <form onSubmit={onManualSubmit} noValidate className="space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground">Manual check-in</p>
              <p className="text-xs text-muted-foreground">
                Member ID or phone number — works even without a camera.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="manual-checkin" className="sr-only">
                  Member ID or phone number
                </Label>
                <Input
                  id="manual-checkin"
                  placeholder="e.g. PGS-0042 or 98765 43210"
                  autoComplete="off"
                  aria-invalid={errors.memberCode ? true : undefined}
                  {...manualField}
                  ref={(node) => {
                    manualField.ref(node);
                    manualInputRef.current = node;
                  }}
                />
                {errors.memberCode ? (
                  <p className="text-xs text-destructive">{errors.memberCode.message}</p>
                ) : null}
              </div>
              <Button type="submit" disabled={manualSubmitting} className="sm:self-start">
                {manualSubmitting ? <Loader2Icon className="animate-spin" /> : <LogInIcon />}
                Check in
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Stagger delayIndex={1}>
        <CheckInResultPanel result={result} sequence={sequence} />
      </Stagger>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="QR attendance"
        description="Scan a member QR or check them in manually — every verdict lands here instantly."
        actions={
          <Button variant="outline" asChild>
            <Link to="/attendance/history">
              <HistoryIcon /> Attendance history
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Scanner console (~2/3) */}
        <div className="space-y-4 lg:col-span-2">
          {canScan ? (
            scannerConsole
          ) : (
            <EmptyState
              icon={<LockIcon className="size-5" />}
              title="Scanning is not enabled for your account"
              description="Ask an owner or admin to grant the QR scanning permission, then reload this page."
            />
          )}
        </div>

        {/* Live feed (~1/3) */}
        <div className="space-y-4 lg:col-span-1">
          <Card className="graphite-surface border-border/70">
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <div className="min-w-0">
                <CardTitle className="text-base">Live now</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {liveNow.loading
                    ? "Loading…"
                    : `${liveTotal} ${liveTotal === 1 ? "member" : "members"} checked in`}
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Refresh live list"
                onClick={liveNow.reload}
              >
                <RefreshCwIcon />
              </Button>
            </CardHeader>
            <CardContent>
              {liveNow.loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-12" />
                  ))}
                </div>
              ) : liveNow.error ? (
                <div className="space-y-3 py-6 text-center">
                  <p className="text-sm text-muted-foreground">{liveNow.error}</p>
                  <Button variant="outline" size="sm" onClick={liveNow.reload}>
                    <RefreshCwIcon /> Retry
                  </Button>
                </div>
              ) : liveItems.length === 0 ? (
                <EmptyState
                  icon={<QrCodeIcon className="size-5" />}
                  title="Nobody inside"
                  description="Members appear here as soon as they check in."
                  className="py-8"
                />
              ) : (
                <ul className="divide-y divide-border/60">
                  {liveItems.map((record) => (
                    <LiveNowRow
                      key={record.id}
                      record={record}
                      trackCheckout={trackCheckout}
                      busy={checkingOutId === record.id}
                      onCheckout={(target) => void handleCheckout(target)}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="graphite-surface border-border/70">
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <div className="min-w-0">
                <CardTitle className="text-base">Scan feed</CardTitle>
                <p className="text-xs text-muted-foreground">Latest results from this console</p>
              </div>
              <Button size="xs" variant="ghost" asChild>
                <Link to="/attendance/history">History</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <ScanFeed entries={entries} loading={seed.loading} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
