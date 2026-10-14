import type {
  DurationUnit,
  EffectiveMembershipStatus,
  MembershipPlan,
  MemberMembership,
  StoredMembershipStatus,
} from "@/types";
import { addMonthsClamped, addDays, parseDateOnly, ymdInTz, gymTimezone } from "@/lib/datetime";

/**
 * Membership business rules.
 *
 * These functions are the single source of truth for eligibility, expiry math
 * and renewal windows on the client. The API data layer uses them for derived
 * fields, the demo data layer computes with them directly, and the backend
 * re-validates the same rules server-side before any check-in or renewal.
 * The unit tests exercise them directly.
 */

export interface MembershipLike {
  startDate: string;
  endDate: string;
  status: StoredMembershipStatus;
}

/** End date for a plan starting on `start` (UTC date-only semantics). */
export function computeEndDate(
  start: Date,
  durationValue: number,
  durationUnit: DurationUnit,
): Date {
  const value = Math.max(1, Math.trunc(durationValue));
  switch (durationUnit) {
    case "day":
      return addDays(start, value);
    case "week":
      return addDays(start, value * 7);
    case "month":
      return addMonthsClamped(start, value);
    case "year":
      return addMonthsClamped(start, value * 12);
    default:
      return addDays(start, value);
  }
}

export function planEndDate(startDate: string | Date, plan: Pick<MembershipPlan, "durationValue" | "durationUnit">): string {
  const start = typeof startDate === "string" ? parseDateOnly(startDate) : startDate;
  return computeEndDate(start, plan.durationValue, plan.durationUnit).toISOString().slice(0, 10);
}

/** Effective status combining the stored status with calendar dates in the gym timezone. */
export function effectiveStatus(
  membership: MembershipLike | null | undefined,
  memberStatus: "active" | "inactive",
  now: Date = new Date(),
  expiringSoonDays = 7,
  timeZone: string = gymTimezone,
): EffectiveMembershipStatus {
  if (memberStatus === "inactive") return "inactive";
  if (!membership) return "none";

  const today = parseDateOnly(ymdInTz(now, timeZone));
  const start = parseDateOnly(membership.startDate);
  const end = parseDateOnly(membership.endDate);

  if (membership.status === "suspended") return "suspended";
  if (membership.status === "cancelled") return "cancelled";
  if (membership.status === "inactive") return "inactive";
  if (today < start) return "none";
  if (today > end) return "expired";

  const daysLeft = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  if (daysLeft <= expiringSoonDays) return "expiring_soon";
  return "active";
}

export function daysRemaining(
  membership: Pick<MembershipLike, "endDate"> | null | undefined,
  now: Date = new Date(),
  timeZone: string = gymTimezone,
): number | null {
  if (!membership?.endDate) return null;
  const today = parseDateOnly(ymdInTz(now, timeZone));
  const end = parseDateOnly(membership.endDate);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

/** Whether an attendance scan should be accepted for this membership. */
export interface EligibilityContext {
  memberStatus: "active" | "inactive";
  membership: MembershipLike | null | undefined;
  settings: { allowExpiredCheckin: boolean };
  now?: Date;
  timeZone?: string;
  expiringSoonDays?: number;
}

export type Eligibility =
  | { eligible: true; status: EffectiveMembershipStatus }
  | { eligible: false; status: EffectiveMembershipStatus; reason: "member_inactive" | "no_membership" | "expired" | "suspended" };

export function checkEligibility(ctx: EligibilityContext): Eligibility {
  const now = ctx.now ?? new Date();
  const timeZone = ctx.timeZone ?? gymTimezone;
  const status = effectiveStatus(ctx.membership, ctx.memberStatus, now, ctx.expiringSoonDays ?? 7, timeZone);

  if (status === "inactive") return { eligible: false, status, reason: "member_inactive" };
  if (status === "none") return { eligible: false, status, reason: "no_membership" };
  if (status === "expired") {
    if (ctx.settings.allowExpiredCheckin) return { eligible: true, status };
    return { eligible: false, status, reason: "expired" };
  }
  if (status === "suspended" || status === "cancelled") {
    return { eligible: false, status, reason: "suspended" };
  }
  return { eligible: true, status };
}

/** Latest membership (by end date) among a member's memberships. */
export function currentMembership(memberships: MemberMembership[]): MemberMembership | null {
  if (memberships.length === 0) return null;
  return [...memberships].sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0] ?? null;
}

/**
 * Start date for a renewal: today, or the day after the current membership
 * ends (so a member can never pay for overlapping days by accident).
 */
export function renewalStartDate(
  now: Date,
  current: Pick<MembershipLike, "endDate"> | null | undefined,
  timeZone: string = gymTimezone,
): string {
  const todayYmd = ymdInTz(now, timeZone);
  if (!current?.endDate || current.endDate < todayYmd) return todayYmd;
  return addDays(parseDateOnly(current.endDate), 1).toISOString().slice(0, 10);
}

/** Balance still owed for a membership given its payments. */
export function membershipBalance(price: number, discount: number, payments: Array<{ amount: number; status: string }>): number {
  const due = Math.max(0, price - Math.max(0, discount));
  const paid = payments
    .filter((p) => p.status === "paid" || p.status === "partial")
    .reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0);
  return Math.max(0, Math.round((due - paid) * 100) / 100);
}

export function membershipSummary(membership: MemberMembership | null | undefined): string {
  if (!membership) return "No membership";
  return `${membership.planName ?? "Plan"} · until ${membership.endDate}`;
}
