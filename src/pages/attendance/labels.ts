import { isDataError } from "@/data/types";
import type {
  AttendanceMethod,
  AttendanceStatus,
  CheckInRejectionReason,
  CheckInResult,
} from "@/types";

/** Human-friendly copy for every rejection reason the service can return. */
export const REJECTION_LABELS: Record<CheckInRejectionReason, string> = {
  invalid_qr: "Not a valid QR",
  revoked_qr: "QR revoked",
  member_inactive: "Member inactive",
  no_membership: "No active membership",
  expired: "Membership expired",
  suspended: "Membership suspended",
  cooldown: "Too soon since last check-in",
  duplicate: "Duplicate scan",
  forbidden: "Not allowed",
  not_found: "Member not found",
  network: "Network problem",
  server_error: "Server error",
};

export const METHOD_LABELS: Record<AttendanceMethod, string> = {
  qr: "QR scan",
  manual: "Manual",
  class: "Class",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  checked_in: "Checked in",
  checked_out: "Checked out",
};

const REJECTION_VALUES: readonly string[] = [
  "invalid_qr",
  "revoked_qr",
  "member_inactive",
  "no_membership",
  "expired",
  "suspended",
  "cooldown",
  "duplicate",
  "forbidden",
  "not_found",
  "network",
  "server_error",
];

export type RejectedCheckIn = Extract<CheckInResult, { status: "rejected" }>;

/** Turn an unexpected thrown error into a rejected result so the UI can render it. */
export function toRejection(error: unknown): RejectedCheckIn {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string" && error.trim().length > 0
        ? error
        : "Something went wrong while recording the check-in.";
  const code = isDataError(error) ? error.code : "";
  const reason: CheckInRejectionReason = REJECTION_VALUES.includes(code)
    ? (code as CheckInRejectionReason)
    : "server_error";
  return { status: "rejected", reason, message };
}

/** `17` → `5 PM`, `0` → `12 AM`. */
export function hourLabel(hour: number | null | undefined): string {
  if (hour === null || hour === undefined || !Number.isFinite(hour)) return "—";
  const normalized = ((Math.trunc(hour) % 24) + 24) % 24;
  const suffix = normalized < 12 ? "AM" : "PM";
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display} ${suffix}`;
}
