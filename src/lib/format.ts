import { format, formatDistanceToNowStrict, isThisYear, parseISO } from "date-fns";
import type {
  EffectiveMembershipStatus,
  MemberStatusFilter,
  PaymentMethod,
  PaymentStatus,
} from "@/types";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrFormatterPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,50,000 — used everywhere money is displayed. */
export function formatINR(value: number, options?: { withPaise?: boolean }): string {
  const safe = Number.isFinite(value) ? value : 0;
  return options?.withPaise ? inrFormatterPaise.format(safe) : inrFormatter.format(Math.round(safe));
}

/** 1,50,000 without the ₹ symbol (charts, CSV). */
export function formatNumberIN(value: number): string {
  return new Intl.NumberFormat("en-IN").format(Number.isFinite(value) ? value : 0);
}

export function formatCompactIN(value: number): string {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return isThisYear(date) ? format(date, "d MMM") : format(date, "d MMM yyyy");
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "d MMM yyyy, h:mm a");
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "h:mm a");
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const STATUS_LABELS: Record<EffectiveMembershipStatus, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  suspended: "Suspended",
  inactive: "Inactive",
  cancelled: "Cancelled",
  none: "No membership",
};

export const MEMBER_FILTER_LABELS: Record<MemberStatusFilter, string> = {
  all: "All members",
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  suspended: "Suspended",
  inactive: "Inactive",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Paid",
  partial: "Partially paid",
  pending: "Pending",
  refunded: "Refunded",
  failed: "Failed",
};

export function durationLabel(value: number, unit: "day" | "week" | "month" | "year"): string {
  const plural = value === 1 ? "" : "s";
  const map = { day: "day", week: "week", month: "month", year: "year" } as const;
  return `${value} ${map[unit]}${plural}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

export function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}
