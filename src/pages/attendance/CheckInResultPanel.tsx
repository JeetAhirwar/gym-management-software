import { motion } from "motion/react";
import { CheckCircle2Icon, ScanLineIcon, TriangleAlertIcon, XCircleIcon } from "lucide-react";
import { SmartImage } from "@/components/shared/SmartImage";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CheckInResult } from "@/types";
import { ATTENDANCE_STATUS_LABELS, METHOD_LABELS, REJECTION_LABELS } from "./labels";

const EASE = [0.22, 1, 0.36, 1] as const;

function ResultShell({
  tone,
  sequence,
  icon,
  eyebrow,
  title,
  children,
  footer,
}: {
  tone: "ok" | "rejected";
  sequence: number;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <motion.div
      key={`${tone}-${sequence}`}
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={cn(
        "rounded-xl border-2 p-5",
        tone === "ok" ? "border-primary/45 bg-primary/10" : "border-destructive/45 bg-destructive/10",
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full",
            tone === "ok" ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-xs font-semibold tracking-widest uppercase",
              tone === "ok" ? "text-primary" : "text-destructive",
            )}
          >
            {eyebrow}
          </p>
          <p className="truncate text-2xl font-semibold tracking-tight text-foreground">{title}</p>
          {children}
        </div>
      </div>
      {footer}
    </motion.div>
  );
}

export function CheckInResultPanel({
  result,
  sequence,
}: {
  result: CheckInResult | null;
  sequence: number;
}) {
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 bg-card/40 px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <ScanLineIcon className="size-5" />
        </span>
        <p className="text-sm font-medium text-foreground">Ready to scan</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Scan a member QR or use manual check-in — the verdict appears here and stays until the next one.
        </p>
      </div>
    );
  }

  if (result.status === "ok") {
    const { member, attendance, warning } = result;
    return (
      <ResultShell
        tone="ok"
        sequence={sequence}
        icon={<CheckCircle2Icon className="size-6" />}
        eyebrow="Checked in"
        title={member.fullName}
        footer={
          warning ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              <TriangleAlertIcon className="size-4 shrink-0" />
              <span>{warning}</span>
            </div>
          ) : null
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <SmartImage src={member.photoUrl} name={member.fullName} className="size-12 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{member.memberCode}</p>
            <p className="truncate text-sm text-muted-foreground">{member.planName ?? "No active plan"}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-sm font-medium text-foreground">{formatDateTime(attendance.checkIn)}</p>
            <p className="text-xs text-muted-foreground">
              {METHOD_LABELS[attendance.method]} · {ATTENDANCE_STATUS_LABELS[attendance.status]}
            </p>
          </div>
        </div>
      </ResultShell>
    );
  }

  const { reason, message, member } = result;
  return (
    <ResultShell
      tone="rejected"
      sequence={sequence}
      icon={<XCircleIcon className="size-6" />}
      eyebrow="Check-in rejected"
      title={REJECTION_LABELS[reason]}
      footer={
        member ? (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-destructive/25 bg-background/50 px-3 py-2">
            <SmartImage src={member.photoUrl} name={member.fullName} className="size-9 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{member.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {member.memberCode} · {member.planName ?? "No active plan"}
                {member.membershipEnd ? ` · ends ${formatDate(member.membershipEnd)}` : ""}
              </p>
            </div>
          </div>
        ) : null
      }
    >
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </ResultShell>
  );
}
