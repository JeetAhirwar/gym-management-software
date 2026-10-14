import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppNotification,
  AttendanceRecord,
  AuditLog,
  CheckInMemberSummary,
  CheckInResult,
  ClassEnrollment,
  DayCount,
  DuesRow,
  DashboardStats,
  EnrollmentStatus,
  Gym,
  GymClass,
  GymSettings,
  Member,
  MemberFrequency,
  MemberMembership,
  MemberQuery,
  MemberStatus,
  MemberWithMembership,
  MembershipPlan,
  MonthRevenue,
  Paginated,
  PaymentRecord,
  PeakHour,
  PlanDistribution,
  RevenueSummary,
  StaffProfile,
  StoredMembershipStatus,
} from "@/types";
import type {
  AttendanceCorrectionInput,
  AttendanceRange,
  ClassCreateInput,
  ClassUpdateInput,
  DataService,
  GymSettingsPatch,
  MemberCreateInput,
  MemberUpdateInput,
  PaymentCreateInput,
  PlanCreateInput,
  PlanUpdateInput,
  RenewMembershipInput,
  ScanContext,
  StaffCreateInput,
  StaffUpdateInput,
} from "@/data/types";
import { DataError } from "@/data/types";
import { getSupabase } from "@/data/supabase/client";
import {
  mapAttendance,
  mapAudit,
  mapClass,
  mapEnrollment,
  mapGym,
  mapMember,
  mapMembership,
  mapNotification,
  mapPayment,
  mapPlan,
  mapSettings,
  mapStaff,
  type AttendanceRow,
  type AuditRow,
  type ClassRow,
  type EnrollmentRow,
  type GymRow,
  type GymSettingsRow,
  type MemberRow,
  type MembershipRow,
  type NotificationRow,
  type PaymentRow,
  type PlanRow,
  type StaffRow,
} from "@/data/supabase/mappers";
import { daysRemaining, effectiveStatus, computeEndDate, membershipBalance, currentMembership, renewalStartDate } from "@/lib/membership";
import { generateQrToken } from "@/lib/qr";
import { addDays, addMonthsClamped, hourInTz, monthKeyInTz, parseDateOnly, ymdInTz, gymTimezone } from "@/lib/datetime";
import type { MemberWithMembership as MWM } from "@/types";

const MEMBER_SELECT =
  "*, member_memberships(*, membership_plans(name, duration_value, duration_unit))";

function throwIfError(error: { message: string; code?: string } | null, fallbackMessage: string): void {
  if (!error) return;
  if (error.code === "23505") {
    throw new DataError("duplicate", "That record conflicts with an existing one (possible duplicate).");
  }
  if (error.code === "P0001" || error.code === "42501") {
    throw new DataError("forbidden", error.message);
  }
  throw new DataError("supabase_error", error.message || fallbackMessage);
}

/** Member row with the nested membership join used by MEMBER_SELECT. */
type MemberWithMembershipsRow = MemberRow & { member_memberships?: MembershipRow[] };

function toRows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

/** PostgREST returns a to-one relation as an object (or array in some cases). */
function rel<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] ?? null) as T;
  return (value ?? null) as T;
}

interface RpcCheckInResponse {
  status: "ok" | "rejected";
  reason?: string;
  message?: string;
  attendance_id?: string;
  check_in?: string;
  member?: {
    id: string;
    member_code: string;
    full_name: string;
    photo_url: string | null;
    plan_name: string | null;
    membership_end: string | null;
    membership_status?: string;
    effective_status?: string;
  };
  warn?: string;
}

export class SupabaseDataService implements DataService {
  readonly mode = "supabase" as const;

  private sb: SupabaseClient;
  private readonly gymId: string;
  private cachedSettings: GymSettings | null = null;
  private cachedGym: Gym | null = null;

  constructor(gymId: string, sb: SupabaseClient = getSupabase()) {
    this.gymId = gymId;
    this.sb = sb;
  }

  /* ------------------------------ plumbing --------------------------- */

  private async tz(): Promise<string> {
    const gym = await this.getGym();
    return gym.timezone ?? gymTimezone;
  }

  private decorateMember(row: MemberRow, memberships: MembershipRow[], settings: GymSettings, tz: string): MWM {
    const mapped = mapMember(row);
    const mine = memberships
      .filter((m) => m.member_id === row.id && m.status !== "cancelled")
      .map(mapMembership)
      .map((m) => ({
        ...m,
        planName: m.planName ?? null,
      }));
    const membership = currentMembership(mine);
    return {
      ...mapped,
      membership: membership ?? null,
      effectiveStatus: effectiveStatus(membership, mapped.status, new Date(), settings.expiringSoonDays, tz),
      planName: membership?.planName ?? null,
      endDate: membership?.endDate ?? null,
      daysRemaining: daysRemaining(membership, new Date(), tz),
    };
  }

  /* ----------------------------- settings ---------------------------- */

  async getGym(): Promise<Gym> {
    if (this.cachedGym) return this.cachedGym;
    const { data, error } = await this.sb.from("gyms").select("*").eq("id", this.gymId).single();
    throwIfError(error, "Unable to load gym details");
    this.cachedGym = mapGym(data as GymRow);
    return this.cachedGym;
  }

  async getSettings(): Promise<GymSettings> {
    if (this.cachedSettings) return this.cachedSettings;
    const { data, error } = await this.sb.from("gym_settings").select("*").eq("gym_id", this.gymId).single();
    if (error) {
      if (error.code === "PGRST116") {
        // Row missing — fall back to documented defaults rather than crashing.
        const gym = await this.getGym();
        return {
          gymId: this.gymId,
          checkinCooldownMinutes: 60,
          trackCheckout: false,
          expiringSoonDays: 7,
          expiryReminderDays: [7, 3, 1],
          allowExpiredCheckin: false,
          enableEmail: false,
          enableSms: false,
          enableWhatsapp: false,
          enablePush: false,
          attendanceRetentionDays: 365,
          updatedAt: gym.updatedAt,
        };
      }
      throwIfError(error, "Unable to load gym settings");
    }
    this.cachedSettings = mapSettings(data as GymSettingsRow);
    return this.cachedSettings;
  }

  async updateSettings(patch: GymSettingsPatch): Promise<GymSettings> {
    const payload: Record<string, unknown> = {};
    if (patch.checkinCooldownMinutes !== undefined) payload.checkin_cooldown_minutes = patch.checkinCooldownMinutes;
    if (patch.trackCheckout !== undefined) payload.track_checkout = patch.trackCheckout;
    if (patch.expiringSoonDays !== undefined) payload.expiring_soon_days = patch.expiringSoonDays;
    if (patch.expiryReminderDays !== undefined) payload.expiry_reminder_days = patch.expiryReminderDays;
    if (patch.allowExpiredCheckin !== undefined) payload.allow_expired_checkin = patch.allowExpiredCheckin;
    if (patch.enableEmail !== undefined) payload.enable_email = patch.enableEmail;
    if (patch.enableSms !== undefined) payload.enable_sms = patch.enableSms;
    if (patch.enableWhatsapp !== undefined) payload.enable_whatsapp = patch.enableWhatsapp;
    if (patch.enablePush !== undefined) payload.enable_push = patch.enablePush;
    if (patch.attendanceRetentionDays !== undefined) payload.attendance_retention_days = patch.attendanceRetentionDays;

    if (Object.keys(payload).length > 0) {
      const { error } = await this.sb.from("gym_settings").update(payload).eq("gym_id", this.gymId);
      throwIfError(error, "Unable to save settings");
    }
    const gymPayload: Record<string, unknown> = {};
    if (typeof patch.gymName === "string") gymPayload.name = patch.gymName;
    if (typeof patch.timezone === "string") gymPayload.timezone = patch.timezone;
    if (Object.keys(gymPayload).length > 0) {
      const { error } = await this.sb.from("gyms").update(gymPayload).eq("id", this.gymId);
      throwIfError(error, "Unable to save gym profile");
      this.cachedGym = null;
    }
    this.cachedSettings = null;
    return this.getSettings();
  }

  /* ----------------------------- dashboard --------------------------- */

  async getDashboardStats(): Promise<DashboardStats> {
    const settings = await this.getSettings();
    const tz = await this.tz();
    const now = new Date();
    const today = ymdInTz(now, tz);
    const monthStart = ymdInTz(addDays(now, -now.getDate() + 1), tz);
    const prevMonthKey = monthKeyInTz(addMonthsClamped(now, -1), tz);
    const currentMonthKey = monthKeyInTz(now, tz);

    const [membersRes, membershipsRes, attendanceRes, paymentsRes, dues] = await Promise.all([
      this.sb.from("members").select("id, status, join_date", { count: "exact", head: false }),
      this.sb.from("member_memberships").select("id, member_id, start_date, end_date, status, price, discount, plan_id"),
      this.sb.from("attendance_records").select("id, check_in, status").gte("check_in", addDays(now, -45).toISOString()),
      this.sb
        .from("payment_records")
        .select("id, amount, payment_date, status")
        .gte("payment_date", ymdInTz(addMonthsClamped(now, -2), tz)),
      this.getDues(),
    ]);
    throwIfError(membersRes.error, "Unable to load members");
    throwIfError(membershipsRes.error, "Unable to load memberships");
    throwIfError(attendanceRes.error, "Unable to load attendance");
    throwIfError(paymentsRes.error, "Unable to load payments");

    const memberRows = (membersRes.data ?? []) as Array<{ id: string; status: MemberStatus; join_date: string }>;
    const membershipRows = (membershipsRes.data ?? []) as MembershipRow[];

    let activeMembers = 0;
    let expiredMembers = 0;
    let expiringSoon = 0;
    for (const member of memberRows) {
      const mine = membershipRows.filter((m) => m.member_id === member.id && m.status !== "cancelled").map(mapMembership);
      const status = effectiveStatus(currentMembership(mine), member.status, now, settings.expiringSoonDays, tz);
      if (status === "active" || status === "expiring_soon") activeMembers += 1;
      if (status === "expired") expiredMembers += 1;
      if (status === "expiring_soon") expiringSoon += 1;
    }

    const attendanceRows = (attendanceRes.data ?? []) as Array<{ check_in: string }>;
    const todaysAttendance = attendanceRows.filter((a) => ymdInTz(new Date(a.check_in), tz) === today);

    const paymentRows = (paymentsRes.data ?? []) as Array<{ amount: string | number; payment_date: string; status: string }>;
    const sumFor = (key: string) =>
      paymentRows
        .filter((p) => monthKeyInTz(parseDateOnly(p.payment_date), tz) === key && (p.status === "paid" || p.status === "partial"))
        .reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      activeMembers,
      newThisMonth: memberRows.filter((m) => m.join_date >= monthStart).length,
      expiredMembers,
      expiringSoon,
      todayAttendance: todaysAttendance.length,
      currentCheckIns: settings.trackCheckout
        ? todaysAttendance.filter((a) => {
            const record = (attendanceRes.data ?? []).find((r) => r.check_in === a.check_in) as
              | { status?: string }
              | undefined;
            return (record?.status ?? "checked_in") === "checked_in";
          }).length
        : todaysAttendance.length,
      monthlyRevenue: sumFor(currentMonthKey),
      previousMonthRevenue: sumFor(prevMonthKey),
      pendingPayments: dues.filter((d) => d.balance > 0).length,
      pendingAmount: dues.reduce((sum, d) => sum + d.balance, 0),
      totalMembers: membersRes.count ?? memberRows.length,
    };
  }

  async getAttendanceTrend(days: number): Promise<DayCount[]> {
    const tz = await this.tz();
    const from = addDays(new Date(), -(days - 1));
    const { data, error } = await this.sb
      .from("attendance_records")
      .select("check_in")
      .gte("check_in", from.toISOString());
    throwIfError(error, "Unable to load attendance trend");

    const buckets = new Map<string, number>();
    for (let i = days - 1; i >= 0; i -= 1) buckets.set(ymdInTz(addDays(new Date(), -i), tz), 0);
    for (const row of (data ?? []) as Array<{ check_in: string }>) {
      const key = ymdInTz(new Date(row.check_in), tz);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets.entries()].map(([date, count]) => ({ date, count }));
  }

  async getRevenueTrend(months: number): Promise<MonthRevenue[]> {
    const tz = await this.tz();
    const now = new Date();
    const from = addMonthsClamped(now, -(months - 1));
    const { data, error } = await this.sb
      .from("payment_records")
      .select("amount, payment_date, status")
      .gte("payment_date", ymdInTz(from, tz))
      .in("status", ["paid", "partial"]);
    throwIfError(error, "Unable to load revenue trend");

    const out: MonthRevenue[] = [];
    for (let i = months - 1; i >= 0; i -= 1) {
      const monthDate = addMonthsClamped(now, -i);
      const key = monthKeyInTz(monthDate, tz);
      const revenue = (data ?? [])
        .filter((r) => monthKeyInTz(parseDateOnly(r.payment_date), tz) === key)
        .reduce((sum, r) => sum + Number(r.amount), 0);
      out.push({ month: key, label: monthDate.toLocaleDateString("en-IN", { month: "short" }), revenue });
    }
    return out;
  }

  async getPlanDistribution(): Promise<PlanDistribution[]> {
    const tz = await this.tz();
    const today = ymdInTz(new Date(), tz);
    const { data, error } = await this.sb
      .from("member_memberships")
      .select("plan_id, price, end_date, status, membership_plans(name)");
    throwIfError(error, "Unable to load plan distribution");
    type PlanDistRow = {
      plan_id: string;
      price: string | number;
      end_date: string;
      status: string;
      membership_plans: Array<{ name: string }> | { name: string } | null;
    };
    const list = toRows<PlanDistRow>(data);
    const grouped = new Map<string, PlanDistribution>();
    for (const row of list) {
      if (row.status !== "active" || row.end_date < today) continue;
      const key = row.plan_id;
      const existing = grouped.get(key) ?? {
        planId: key,
        planName: rel(row.membership_plans)?.name ?? "Plan",
        count: 0,
        value: 0,
      };
      existing.count += 1;
      existing.value += Number(row.price ?? 0);
      grouped.set(key, existing);
    }
    return [...grouped.values()].sort((a, b) => b.count - a.count);
  }

  async getRecentCheckIns(limit: number): Promise<AttendanceRecord[]> {
    const { data, error } = await this.sb
      .from("attendance_records")
      .select("*, member:members(full_name, member_code, photo_url), scanner:profiles(full_name)")
      .order("check_in", { ascending: false })
      .limit(limit);
    throwIfError(error, "Unable to load recent check-ins");
    return ((data ?? []) as AttendanceRow[]).map(mapAttendance);
  }

  async getRecentMembers(limit: number): Promise<MemberWithMembership[]> {
    const settings = await this.getSettings();
    const tz = await this.tz();
    const { data, error } = await this.sb
      .from("members")
      .select(MEMBER_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit);
    throwIfError(error, "Unable to load recent members");
    const list = toRows<MemberWithMembershipsRow>(data);
    return list.map((row) => this.decorateMember(row, row.member_memberships ?? [], settings, tz));
  }

  async getUpcomingExpiries(limit: number): Promise<MemberWithMembership[]> {
    const settings = await this.getSettings();
    const tz = await this.tz();
    const today = ymdInTz(new Date(), tz);
    const horizon = ymdInTz(addDays(new Date(), 90), tz);
    const { data, error } = await this.sb
      .from("member_memberships")
      .select("*, members(*), membership_plans(name, duration_value, duration_unit)")
      .eq("status", "active")
      .gte("end_date", today)
      .lte("end_date", horizon)
      .order("end_date", { ascending: true })
      .limit(limit * 2);
    throwIfError(error, "Unable to load expiring memberships");
    const list = toRows<MembershipRow & { members: MemberRow }>(data);
    const seen = new Set<string>();
    const out: MemberWithMembership[] = [];
    for (const row of list) {
      if (seen.has(row.member_id)) continue;
      seen.add(row.member_id);
      const member = rel(row.members);
      if (!member) continue;
      out.push(this.decorateMember(member, [row], settings, tz));
      if (out.length >= limit) break;
    }
    return out;
  }

  /* ------------------------------- members --------------------------- */

  async listMembers(query: MemberQuery = {}): Promise<Paginated<MemberWithMembership>> {
    const settings = await this.getSettings();
    const tz = await this.tz();
    const search = query.search?.trim() ?? "";
    let request = this.sb.from("members").select(MEMBER_SELECT).limit(1000);
    if (search) {
      const term = search.replace(/[%_]/g, "");
      request = request.or(
        `full_name.ilike.%${term}%,member_code.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`,
      );
    }
    const { data, error } = await request;
    throwIfError(error, "Unable to load members");

    let rows = toRows<MemberWithMembershipsRow>(data).map((row) =>
      this.decorateMember(row, row.member_memberships ?? [], settings, tz),
    );

    switch (query.status) {
      case "active":
        rows = rows.filter((r) => r.effectiveStatus === "active");
        break;
      case "expiring_soon":
        rows = rows.filter((r) => r.effectiveStatus === "expiring_soon");
        break;
      case "expired":
        rows = rows.filter((r) => r.effectiveStatus === "expired");
        break;
      case "suspended":
        rows = rows.filter((r) => r.effectiveStatus === "suspended");
        break;
      case "inactive":
        rows = rows.filter((r) => r.effectiveStatus === "inactive" || r.status === "inactive");
        break;
      default:
        break;
    }
    if (query.planId) rows = rows.filter((r) => r.membership?.planId === query.planId);

    const dir = query.dir === "asc" ? 1 : -1;
    const sort = query.sort ?? "created";
    rows.sort((a, b) => {
      switch (sort) {
        case "name":
          return a.fullName.localeCompare(b.fullName) * dir;
        case "joined":
          return (a.joinDate < b.joinDate ? -1 : 1) * dir;
        case "expiry":
          return ((a.membership?.endDate ?? "") < (b.membership?.endDate ?? "") ? -1 : 1) * dir;
        default:
          return (a.createdAt < b.createdAt ? -1 : 1) * dir;
      }
    });

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(5, query.pageSize ?? 10));
    const start = (page - 1) * pageSize;
    return { items: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
  }

  async listAllMembers(): Promise<MemberWithMembership[]> {
    const result = await this.listMembers({ pageSize: 100, page: 1 });
    return result.items;
  }

  async getMember(id: string): Promise<MemberWithMembership | null> {
    const settings = await this.getSettings();
    const tz = await this.tz();
    const { data, error } = await this.sb.from("members").select(MEMBER_SELECT).eq("id", id).maybeSingle();
    throwIfError(error, "Unable to load member");
    if (!data) return null;
    const row = data as MemberWithMembershipsRow;
    return this.decorateMember(row, row.member_memberships ?? [], settings, tz);
  }

  private async nextMemberCode(): Promise<string> {
    const { count, error } = await this.sb.from("members").select("id", { count: "exact", head: true });
    throwIfError(error, "Unable to allocate a member code");
    const base = (count ?? 0) + 1;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = `PGS-${String(base + attempt).padStart(4, "0")}`;
      const { data } = await this.sb.from("members").select("id").eq("gym_id", this.gymId).eq("member_code", code).maybeSingle();
      if (!data) return code;
    }
    return `PGS-${Date.now().toString(36).toUpperCase()}`;
  }

  async createMember(input: MemberCreateInput): Promise<MemberWithMembership> {
    const email = input.email?.trim() ? input.email.trim().toLowerCase() : null;
    const duplicate = await this.sb
      .from("members")
      .select("id")
      .eq("gym_id", this.gymId)
      .or(email ? `phone.eq.${input.phone},email.eq.${email}` : `phone.eq.${input.phone}`)
      .limit(1);
    throwIfError(duplicate.error, "Unable to check for duplicates");
    if ((duplicate.data ?? []).length > 0) {
      throw new DataError("duplicate", "A member with this phone number or email already exists.");
    }

    const memberCode = await this.nextMemberCode();
    const { data, error } = await this.sb
      .from("members")
      .insert({
        gym_id: this.gymId,
        member_code: memberCode,
        full_name: input.fullName.trim(),
        email,
        phone: input.phone.trim(),
        photo_url: input.photoUrl ?? null,
        date_of_birth: input.dateOfBirth || null,
        gender: input.gender ?? null,
        address: input.address ?? null,
        emergency_contact_name: input.emergencyContactName ?? null,
        emergency_contact_phone: input.emergencyContactPhone || null,
        join_date: input.joinDate,
        qr_token: generateQrToken(),
        qr_status: "active",
        status: "active",
        notes: input.notes ?? null,
      })
      .select("id")
      .single();
    if (error) {
      throwIfError(error, "Unable to create member");
    }
    const memberId = (data as { id: string }).id;

    try {
      await this.renewMembership({
        memberId,
        planId: input.planId,
        startDate: input.membershipStart,
        source: "new",
        notes: "First membership",
        initialPayment: input.initialPayment ?? null,
      });
    } catch (membershipError) {
      // Best-effort cleanup so a failed join does not leave a memberless shell.
      await this.sb.from("members").delete().eq("id", memberId);
      throw membershipError;
    }

    const created = await this.getMember(memberId);
    if (!created) throw new DataError("server_error", "Member was created but could not be re-read.");
    return created;
  }

  async updateMember(id: string, input: MemberUpdateInput): Promise<MemberWithMembership> {
    const payload: Record<string, unknown> = {};
    if (input.fullName !== undefined) payload.full_name = input.fullName.trim();
    if (input.email !== undefined) payload.email = input.email?.trim() ? input.email.trim().toLowerCase() : null;
    if (input.phone !== undefined) payload.phone = input.phone.trim();
    if (input.photoUrl !== undefined) payload.photo_url = input.photoUrl;
    if (input.dateOfBirth !== undefined) payload.date_of_birth = input.dateOfBirth || null;
    if (input.gender !== undefined) payload.gender = input.gender;
    if (input.address !== undefined) payload.address = input.address || null;
    if (input.emergencyContactName !== undefined) payload.emergency_contact_name = input.emergencyContactName || null;
    if (input.emergencyContactPhone !== undefined) payload.emergency_contact_phone = input.emergencyContactPhone || null;
    if (input.joinDate !== undefined) payload.join_date = input.joinDate;
    if (input.notes !== undefined) payload.notes = input.notes;
    if (input.status !== undefined) payload.status = input.status;

    const { error } = await this.sb.from("members").update(payload).eq("id", id);
    throwIfError(error, "Unable to update member");
    const updated = await this.getMember(id);
    if (!updated) throw new DataError("not_found", "Member not found");
    return updated;
  }

  async deleteMember(id: string): Promise<void> {
    const { error } = await this.sb.from("members").delete().eq("id", id);
    throwIfError(error, "Unable to delete member");
  }

  async setMemberStatus(id: string, status: MemberStatus): Promise<MemberWithMembership> {
    return this.updateMember(id, { status });
  }

  async getMembershipHistory(memberId: string): Promise<MemberMembership[]> {
    const { data, error } = await this.sb
      .from("member_memberships")
      .select("*, membership_plans(name, duration_value, duration_unit)")
      .eq("member_id", memberId)
      .order("start_date", { ascending: false });
    throwIfError(error, "Unable to load membership history");
    return ((data ?? []) as MembershipRow[]).map(mapMembership);
  }

  async renewMembership(input: RenewMembershipInput): Promise<MemberMembership> {
    const { data, error } = await this.sb.rpc("renew_membership", {
      p_member_id: input.memberId,
      p_plan_id: input.planId,
      p_start_date: input.startDate ?? null,
      p_discount: input.discount ?? 0,
      p_notes: input.notes ?? null,
      p_source: input.source ?? "renewal",
    });
    if (error) throwIfError(error, "Unable to renew membership");
    const payload = (data ?? {}) as { id?: string; status?: string; message?: string };
    if (payload.status === "rejected" || !payload.id) {
      throw new DataError("renewal_failed", payload.message ?? "Membership renewal was rejected.");
    }
    if (input.initialPayment && input.initialPayment.amount > 0) {
      await this.createPayment({
        memberId: input.memberId,
        membershipId: payload.id,
        amount: input.initialPayment.amount,
        method: input.initialPayment.method,
        transactionRef: input.initialPayment.transactionRef ?? null,
        notes: input.initialPayment.notes ?? null,
      });
    }
    const { data: row, error: readError } = await this.sb
      .from("member_memberships")
      .select("*, membership_plans(name, duration_value, duration_unit)")
      .eq("id", payload.id)
      .single();
    throwIfError(readError, "Unable to load the renewed membership");
    return mapMembership(row as MembershipRow);
  }

  async setMembershipStatus(membershipId: string, status: StoredMembershipStatus, notes?: string | null): Promise<MemberMembership> {
    const { error } = await this.sb
      .from("member_memberships")
      .update({ status, notes: notes ?? undefined })
      .eq("id", membershipId);
    throwIfError(error, "Unable to update membership status");
    const { data, error: readError } = await this.sb
      .from("member_memberships")
      .select("*, membership_plans(name, duration_value, duration_unit)")
      .eq("id", membershipId)
      .single();
    throwIfError(readError, "Unable to reload membership");
    return mapMembership(data as MembershipRow);
  }

  async rotateQrToken(memberId: string): Promise<Member> {
    const { data, error } = await this.sb.rpc("rotate_qr_token", { p_member_id: memberId });
    if (error) throwIfError(error, "Unable to regenerate the QR code");
    const payload = (data ?? {}) as { status?: string; message?: string };
    if (payload.status === "rejected") throw new DataError("forbidden", payload.message ?? "Not allowed.");
    const { data: row, error: readError } = await this.sb.from("members").select("*").eq("id", memberId).single();
    throwIfError(readError, "Unable to reload member");
    return mapMember(row as MemberRow);
  }

  /* -------------------------------- plans ---------------------------- */

  async listPlans(includeInactive = true): Promise<MembershipPlan[]> {
    let request = this.sb.from("membership_plans").select("*").order("sort_order", { ascending: true });
    if (!includeInactive) request = request.eq("is_active", true);
    const { data, error } = await request;
    throwIfError(error, "Unable to load plans");
    return ((data ?? []) as PlanRow[]).map(mapPlan);
  }

  async createPlan(input: PlanCreateInput): Promise<MembershipPlan> {
    const { data, error } = await this.sb
      .from("membership_plans")
      .insert({
        gym_id: this.gymId,
        name: input.name.trim(),
        description: input.description ?? null,
        price: input.price,
        duration_value: input.durationValue,
        duration_unit: input.durationUnit,
        benefits: input.benefits ?? [],
        is_active: input.isActive ?? true,
        sort_order: input.sortOrder ?? 0,
      })
      .select("*")
      .single();
    throwIfError(error, "Unable to create plan");
    return mapPlan(data as PlanRow);
  }

  async updatePlan(id: string, input: PlanUpdateInput): Promise<MembershipPlan> {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.description !== undefined) payload.description = input.description;
    if (input.price !== undefined) payload.price = input.price;
    if (input.durationValue !== undefined) payload.duration_value = input.durationValue;
    if (input.durationUnit !== undefined) payload.duration_unit = input.durationUnit;
    if (input.benefits !== undefined) payload.benefits = input.benefits;
    if (input.isActive !== undefined) payload.is_active = input.isActive;
    if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
    const { data, error } = await this.sb.from("membership_plans").update(payload).eq("id", id).select("*").single();
    throwIfError(error, "Unable to update plan");
    return mapPlan(data as PlanRow);
  }

  async archivePlan(id: string, isActive: boolean): Promise<MembershipPlan> {
    return this.updatePlan(id, { isActive });
  }

  /* ------------------------------ attendance ------------------------- */

  private summaryFromRpc(member: RpcCheckInResponse["member"]): CheckInMemberSummary | undefined {
    if (!member) return undefined;
    return {
      id: member.id,
      memberCode: member.member_code,
      fullName: member.full_name,
      photoUrl: member.photo_url,
      planName: member.plan_name,
      membershipEnd: member.membership_end,
      effectiveStatus: (member.effective_status as CheckInMemberSummary["effectiveStatus"]) ?? "active",
    };
  }

  private async rpcCheckIn(token: string, ctx?: ScanContext): Promise<CheckInResult> {
    const { data, error } = await this.sb.rpc("record_attendance", {
      p_qr_token: token,
      p_method: ctx?.method ?? "qr",
      p_notes: ctx?.notes ?? null,
    });
    if (error) {
      throwIfError(error, "Unable to record attendance");
    }
    const payload = (data ?? {}) as RpcCheckInResponse;
    if (payload.status === "ok" && payload.attendance_id) {
      const { data: row } = await this.sb
        .from("attendance_records")
        .select("*, member:members(full_name, member_code, photo_url), scanner:profiles(full_name)")
        .eq("id", payload.attendance_id)
        .maybeSingle();
      const attendance = row
        ? mapAttendance(row as AttendanceRow)
        : ({
            id: payload.attendance_id,
            gymId: this.gymId,
            memberId: payload.member?.id ?? "",
            membershipId: null,
            checkIn: payload.check_in ?? new Date().toISOString(),
            checkOut: null,
            status: "checked_in",
            method: ctx?.method ?? "qr",
            scannerId: null,
            notes: ctx?.notes ?? null,
            meta: {},
            createdAt: payload.check_in ?? new Date().toISOString(),
            updatedAt: payload.check_in ?? new Date().toISOString(),
          } satisfies AttendanceRecord);
      return {
        status: "ok",
        attendance,
        member: this.summaryFromRpc(payload.member) ?? {
          id: "",
          memberCode: "—",
          fullName: "Member",
          photoUrl: null,
          planName: null,
          membershipEnd: null,
          effectiveStatus: "active",
        },
        warning: payload.warn,
      };
    }
    const messages: Record<string, string> = {
      invalid_qr: "QR code is not recognised.",
      revoked_qr: "This QR code has been revoked. Ask the front desk for a new one.",
      member_inactive: "This member account is inactive.",
      no_membership: "No active membership found. Please renew at the front desk.",
      expired: "Membership expired. Please renew before checking in.",
      suspended: "Membership is suspended. Please contact the gym owner.",
      cooldown: "Member already checked in recently. Duplicate prevented.",
      duplicate: "Duplicate scan ignored.",
      forbidden: "You are not authorised to record attendance for this member.",
    };
    const reason = (payload.reason ?? "server_error") as CheckInResult extends { reason: infer R } ? R : never;
    return {
      status: "rejected",
      reason,
      message: payload.message ?? messages[payload.reason ?? ""] ?? "Attendance was rejected.",
      member: this.summaryFromRpc(payload.member),
    };
  }

  async checkInByToken(token: string, ctx?: ScanContext): Promise<CheckInResult> {
    return this.rpcCheckIn(token, { ...ctx, method: ctx?.method ?? "qr" });
  }

  async checkInByMemberCode(code: string, ctx?: ScanContext): Promise<CheckInResult> {
    const term = code.trim();
    const { data, error } = await this.sb
      .from("members")
      .select("id, qr_token")
      .eq("gym_id", this.gymId)
      .or(`member_code.eq.${term},phone.eq.${term}`)
      .limit(1);
    throwIfError(error, "Unable to look up member");
    const row = (data ?? [])[0] as { id: string; qr_token: string } | undefined;
    if (!row) {
      return { status: "rejected", reason: "not_found", message: "No member matches that ID or phone number." };
    }
    return this.rpcCheckIn(row.qr_token, { ...ctx, method: "manual" });
  }

  async recordCheckout(attendanceId: string): Promise<AttendanceRecord> {
    const { data, error } = await this.sb
      .from("attendance_records")
      .update({ check_out: new Date().toISOString(), status: "checked_out" })
      .eq("id", attendanceId)
      .select("*, member:members(full_name, member_code, photo_url), scanner:profiles(full_name)")
      .single();
    throwIfError(error, "Unable to record checkout");
    return mapAttendance(data as AttendanceRow);
  }

  async listAttendance(query: import("@/types").AttendanceQuery = {}): Promise<Paginated<AttendanceRecord>> {
    const tz = await this.tz();
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(5, query.pageSize ?? 20));
    let request = this.sb
      .from("attendance_records")
      .select("*, member:members(full_name, member_code, photo_url), scanner:profiles(full_name)", { count: "exact" });
    if (query.from) request = request.gte("check_in", `${query.from}T00:00:00.000Z`);
    if (query.to) request = request.lte("check_in", `${query.to}T23:59:59.999Z`);
    if (query.memberId) request = request.eq("member_id", query.memberId);
    if (query.status && query.status !== "all") request = request.eq("status", query.status);
    const { data, count, error } = await request
      .order("check_in", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    throwIfError(error, "Unable to load attendance");
    void tz;
    return {
      items: ((data ?? []) as AttendanceRow[]).map(mapAttendance),
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async listMemberAttendance(memberId: string, limit = 30): Promise<AttendanceRecord[]> {
    const { data, error } = await this.sb
      .from("attendance_records")
      .select("*, member:members(full_name, member_code, photo_url), scanner:profiles(full_name)")
      .eq("member_id", memberId)
      .order("check_in", { ascending: false })
      .limit(limit);
    throwIfError(error, "Unable to load member attendance");
    return ((data ?? []) as AttendanceRow[]).map(mapAttendance);
  }

  async correctAttendance(id: string, patch: AttendanceCorrectionInput): Promise<AttendanceRecord> {
    const payload: Record<string, unknown> = {};
    if (patch.checkIn !== undefined) payload.check_in = patch.checkIn;
    if (patch.checkOut !== undefined) payload.check_out = patch.checkOut;
    if (patch.notes !== undefined) payload.notes = patch.notes;
    if (patch.checkOut) payload.status = "checked_out";
    else if (patch.checkOut === null) payload.status = "checked_in";
    const { data, error } = await this.sb
      .from("attendance_records")
      .update(payload)
      .eq("id", id)
      .select("*, member:members(full_name, member_code, photo_url), scanner:profiles(full_name)")
      .single();
    throwIfError(error, "Unable to correct attendance");
    return mapAttendance(data as AttendanceRow);
  }

  private async loadAttendanceForRange(range: AttendanceRange): Promise<Array<{ check_in: string; member_id: string; status: string }>> {
    const { data, error } = await this.sb
      .from("attendance_records")
      .select("check_in, member_id, status")
      .gte("check_in", range.from.toISOString())
      .lte("check_in", range.to.toISOString());
    throwIfError(error, "Unable to load attendance for the selected range");
    return (data ?? []) as Array<{ check_in: string; member_id: string; status: string }>;
  }

  async getAttendanceSummary(range: AttendanceRange): Promise<import("@/types").AttendanceReportSummary> {
    const tz = await this.tz();
    const rows = await this.loadAttendanceForRange(range);
    const days = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000));
    const hourCounts = new Map<number, number>();
    for (const row of rows) {
      const hour = hourInTz(new Date(row.check_in), tz);
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }
    let busiest: number | null = null;
    let best = 0;
    for (const [hour, count] of hourCounts) {
      if (count > best) {
        best = count;
        busiest = hour;
      }
    }
    return {
      totalVisits: rows.length,
      uniqueMembers: new Set(rows.map((r) => r.member_id)).size,
      averagePerDay: Math.round((rows.length / days) * 10) / 10,
      busiestHour: busiest,
      checkIns: rows.filter((r) => r.status === "checked_in").length,
    };
  }

  async getPeakHours(range: AttendanceRange): Promise<PeakHour[]> {
    const tz = await this.tz();
    const rows = await this.loadAttendanceForRange(range);
    const buckets: PeakHour[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "a" : "p"}`,
      count: 0,
    }));
    for (const row of rows) {
      const bucket = buckets[hourInTz(new Date(row.check_in), tz)];
      if (bucket) bucket.count += 1;
    }
    return buckets;
  }

  async getMemberFrequencies(range: AttendanceRange, limit: number): Promise<MemberFrequency[]> {
    const { data, error } = await this.sb
      .from("attendance_records")
      .select("member_id, members(member_code, full_name)")
      .gte("check_in", range.from.toISOString())
      .lte("check_in", range.to.toISOString());
    throwIfError(error, "Unable to load member attendance frequency");
    const list = toRows<{ member_id: string; members: Array<{ member_code: string; full_name: string }> | { member_code: string; full_name: string } | null }>(data);
    const counts = new Map<string, MemberFrequency>();
    for (const row of list) {
      const member = rel(row.members);
      const existing = counts.get(row.member_id);
      if (existing) existing.visits += 1;
      else
        counts.set(row.member_id, {
          memberId: row.member_id,
          memberCode: member?.member_code ?? "",
          memberName: member?.full_name ?? "Member",
          visits: 1,
        });
    }
    return [...counts.values()].sort((a, b) => b.visits - a.visits).slice(0, limit);
  }

  /* ------------------------------- payments -------------------------- */

  async listPayments(query: import("@/types").PaymentQuery = {}): Promise<Paginated<PaymentRecord>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(5, query.pageSize ?? 15));
    let request = this.sb
      .from("payment_records")
      .select(
        "*, member:members(full_name, member_code), membership:member_memberships(start_date, end_date, membership_plans(name))",
        { count: "exact" },
      );
    if (query.from) request = request.gte("payment_date", query.from);
    if (query.to) request = request.lte("payment_date", query.to);
    if (query.status && query.status !== "all") request = request.eq("status", query.status);
    if (query.method && query.method !== "all") request = request.eq("method", query.method);
    if (query.memberId) request = request.eq("member_id", query.memberId);
    const { data, count, error } = await request
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    throwIfError(error, "Unable to load payments");
    return {
      items: ((data ?? []) as PaymentRow[]).map(mapPayment),
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async createPayment(input: PaymentCreateInput): Promise<PaymentRecord> {
    const { data, error } = await this.sb.rpc("record_payment", {
      p_member_id: input.memberId,
      p_membership_id: input.membershipId ?? null,
      p_amount: input.amount,
      p_method: input.method,
      p_payment_date: input.paymentDate ?? null,
      p_status: input.status ?? "paid",
      p_transaction_ref: input.transactionRef ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throwIfError(error, "Unable to record payment");
    const payload = (data ?? {}) as { id?: string; status?: string; message?: string };
    if (payload.status === "rejected" || !payload.id) {
      throw new DataError("payment_failed", payload.message ?? "Payment was rejected.");
    }
    const { data: row, error: readError } = await this.sb
      .from("payment_records")
      .select(
        "*, member:members(full_name, member_code), membership:member_memberships(start_date, end_date, membership_plans(name))",
      )
      .eq("id", payload.id)
      .single();
    throwIfError(readError, "Unable to reload the payment");
    return mapPayment(row as PaymentRow);
  }

  async refundPayment(paymentId: string, amount: number, reason: string): Promise<PaymentRecord> {
    const { data, error } = await this.sb.rpc("record_refund", {
      p_payment_id: paymentId,
      p_amount: amount,
      p_reason: reason,
    });
    if (error) throwIfError(error, "Unable to record refund");
    const payload = (data ?? {}) as { id?: string; status?: string; message?: string };
    if (payload.status === "rejected" || !payload.id) {
      throw new DataError("refund_failed", payload.message ?? "Refund was rejected.");
    }
    const { data: row, error: readError } = await this.sb
      .from("payment_records")
      .select(
        "*, member:members(full_name, member_code), membership:member_memberships(start_date, end_date, membership_plans(name))",
      )
      .eq("id", payload.id)
      .single();
    throwIfError(readError, "Unable to reload the refund");
    return mapPayment(row as PaymentRow);
  }

  async getDues(): Promise<DuesRow[]> {
    const [membershipsRes, paymentsRes] = await Promise.all([
      this.sb
        .from("member_memberships")
        .select("id, member_id, price, discount, end_date, status, members(member_code, full_name), membership_plans(name)")
        .neq("status", "cancelled"),
      this.sb
        .from("payment_records")
        .select("membership_id, amount, status")
        .in("status", ["paid", "partial"]),
    ]);
    throwIfError(membershipsRes.error, "Unable to load memberships");
    throwIfError(paymentsRes.error, "Unable to load payments");

    const paymentRows = toRows<{ membership_id: string | null; amount: string | number; status: string }>(paymentsRes.data);
    type DuesMembershipRow = MembershipRow & {
      members: Array<{ member_code: string; full_name: string }> | { member_code: string; full_name: string } | null;
      membership_plans: Array<{ name: string }> | { name: string } | null;
    };
    const list = toRows<DuesMembershipRow>(membershipsRes.data);
    const out: DuesRow[] = [];
    for (const row of list) {
      const member = rel(row.members);
      const plan = rel(row.membership_plans);
      const payments = paymentRows
        .filter((p) => p.membership_id === row.id)
        .map((p) => ({ amount: Number(p.amount), status: p.status }));
      const balance = membershipBalance(Number(row.price), Number(row.discount), payments);
      if (balance <= 0) continue;
      out.push({
        memberId: row.member_id,
        memberCode: member?.member_code ?? "—",
        memberName: member?.full_name ?? "Member",
        membershipId: row.id,
        planName: plan?.name ?? "Plan",
        endDate: row.end_date,
        billed: Math.max(0, Number(row.price) - Number(row.discount)),
        paid: payments.reduce((sum, p) => sum + Number(p.amount), 0),
        balance,
      });
    }
    return out.sort((a, b) => b.balance - a.balance);
  }

  async getRevenueSummary(months: number): Promise<RevenueSummary[]> {
    const tz = await this.tz();
    const now = new Date();
    const from = ymdInTz(addMonthsClamped(now, -(months - 1)), tz);
    const { data, error } = await this.sb
      .from("payment_records")
      .select("amount, payment_date, status")
      .gte("payment_date", from);
    throwIfError(error, "Unable to load revenue summary");
    const rows = (data ?? []) as Array<{ amount: string | number; payment_date: string; status: string }>;
    const out: RevenueSummary[] = [];
    for (let i = months - 1; i >= 0; i -= 1) {
      const monthDate = addMonthsClamped(now, -i);
      const key = monthKeyInTz(monthDate, tz);
      const inMonth = rows.filter((r) => monthKeyInTz(parseDateOnly(r.payment_date), tz) === key);
      const collected = inMonth
        .filter((r) => r.status === "paid" || r.status === "partial")
        .reduce((sum, r) => sum + Number(r.amount), 0);
      const refunded = inMonth.filter((r) => r.status === "refunded").reduce((sum, r) => sum + Number(r.amount), 0);
      out.push({
        month: key,
        label: monthDate.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
        collected: Math.max(0, collected - refunded),
        expected: collected,
        outstanding: Math.max(0, refunded),
        count: inMonth.filter((r) => r.status === "paid" || r.status === "partial").length,
      });
    }
    return out;
  }

  /* -------------------------------- staff ---------------------------- */

  async listStaff(includeInactive = true): Promise<StaffProfile[]> {
    let request = this.sb.from("staff_profiles").select("*");
    if (!includeInactive) request = request.eq("employment_status", "active");
    const { data, error } = await request.order("full_name", { ascending: true });
    throwIfError(error, "Unable to load staff");
    return ((data ?? []) as StaffRow[]).map(mapStaff);
  }

  async createStaff(input: StaffCreateInput): Promise<StaffProfile> {
    const { data, error } = await this.sb
      .from("staff_profiles")
      .insert({
        gym_id: this.gymId,
        full_name: input.fullName.trim(),
        email: input.email?.trim() || null,
        phone: input.phone.trim(),
        role: input.role,
        specialization: input.specialization ?? null,
        employment_status: input.employmentStatus,
        joining_date: input.joiningDate,
        photo_url: input.photoUrl ?? null,
        notes: input.notes ?? null,
      })
      .select("*")
      .single();
    throwIfError(error, "Unable to create staff member");
    return mapStaff(data as StaffRow);
  }

  async updateStaff(id: string, input: StaffUpdateInput): Promise<StaffProfile> {
    const payload: Record<string, unknown> = {};
    if (input.fullName !== undefined) payload.full_name = input.fullName.trim();
    if (input.email !== undefined) payload.email = input.email?.trim() || null;
    if (input.phone !== undefined) payload.phone = input.phone.trim();
    if (input.role !== undefined) payload.role = input.role;
    if (input.specialization !== undefined) payload.specialization = input.specialization;
    if (input.employmentStatus !== undefined) payload.employment_status = input.employmentStatus;
    if (input.joiningDate !== undefined) payload.joining_date = input.joiningDate;
    if (input.photoUrl !== undefined) payload.photo_url = input.photoUrl;
    if (input.notes !== undefined) payload.notes = input.notes;
    const { data, error } = await this.sb.from("staff_profiles").update(payload).eq("id", id).select("*").single();
    throwIfError(error, "Unable to update staff member");
    return mapStaff(data as StaffRow);
  }

  async archiveStaff(id: string): Promise<StaffProfile> {
    return this.updateStaff(id, { employmentStatus: "resigned" });
  }

  /* ------------------------------- classes --------------------------- */

  async listClasses(from: Date, to: Date): Promise<GymClass[]> {
    const { data, error } = await this.sb
      .from("gym_classes")
      .select("*, trainer:staff_profiles(full_name), enrollments(id, status)")
      .gte("starts_at", from.toISOString())
      .lte("starts_at", to.toISOString())
      .order("starts_at", { ascending: true });
    throwIfError(error, "Unable to load classes");
    return ((data ?? []) as ClassRow[]).map((row) =>
      mapClass(row, row.enrollments?.filter((e) => e.id).length ?? 0),
    );
  }

  async getClass(id: string): Promise<GymClass | null> {
    const { data, error } = await this.sb
      .from("gym_classes")
      .select("*, trainer:staff_profiles(full_name), enrollments(id, status)")
      .eq("id", id)
      .maybeSingle();
    throwIfError(error, "Unable to load class");
    if (!data) return null;
    const row = data as ClassRow;
    return mapClass(row, row.enrollments?.filter((e) => e.id).length ?? 0);
  }

  async createClass(input: ClassCreateInput): Promise<GymClass> {
    const { data, error } = await this.sb
      .from("gym_classes")
      .insert({
        gym_id: this.gymId,
        name: input.name.trim(),
        description: input.description ?? null,
        trainer_id: input.trainerId ?? null,
        starts_at: input.startsAt,
        duration_minutes: input.durationMinutes,
        capacity: input.capacity,
      })
      .select("*, trainer:staff_profiles(full_name)")
      .single();
    throwIfError(error, "Unable to create class");
    return mapClass(data as ClassRow, 0);
  }

  async updateClass(id: string, input: ClassUpdateInput): Promise<GymClass> {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.description !== undefined) payload.description = input.description;
    if (input.trainerId !== undefined) payload.trainer_id = input.trainerId;
    if (input.startsAt !== undefined) payload.starts_at = input.startsAt;
    if (input.durationMinutes !== undefined) payload.duration_minutes = input.durationMinutes;
    if (input.capacity !== undefined) payload.capacity = input.capacity;
    const { error } = await this.sb.from("gym_classes").update(payload).eq("id", id);
    throwIfError(error, "Unable to update class");
    const cls = await this.getClass(id);
    if (!cls) throw new DataError("not_found", "Class not found");
    return cls;
  }

  async cancelClass(id: string): Promise<GymClass> {
    const { error } = await this.sb.from("gym_classes").update({ status: "cancelled" }).eq("id", id);
    throwIfError(error, "Unable to cancel class");
    await this.sb.from("class_enrollments").update({ status: "cancelled" }).eq("class_id", id).eq("status", "enrolled");
    const cls = await this.getClass(id);
    if (!cls) throw new DataError("not_found", "Class not found");
    return cls;
  }

  async listEnrollments(classId: string): Promise<ClassEnrollment[]> {
    const { data, error } = await this.sb
      .from("class_enrollments")
      .select("*, member:members(full_name, member_code, photo_url)")
      .eq("class_id", classId)
      .neq("status", "cancelled")
      .order("enrolled_at", { ascending: true });
    throwIfError(error, "Unable to load enrollments");
    return ((data ?? []) as EnrollmentRow[]).map(mapEnrollment);
  }

  async enroll(classId: string, memberId: string): Promise<ClassEnrollment> {
    const { data, error } = await this.sb
      .from("class_enrollments")
      .insert({ gym_id: this.gymId, class_id: classId, member_id: memberId })
      .select("*, member:members(full_name, member_code, photo_url)")
      .single();
    if (error) {
      if (error.code === "23514") throw new DataError("class_full", "This class is already at full capacity.");
      if (error.code === "23505") throw new DataError("already_enrolled", "This member is already enrolled.");
      throwIfError(error, "Unable to enrol member");
    }
    return mapEnrollment(data as EnrollmentRow);
  }

  async cancelEnrollment(enrollmentId: string): Promise<void> {
    const { error } = await this.sb.from("class_enrollments").update({ status: "cancelled" }).eq("id", enrollmentId);
    throwIfError(error, "Unable to cancel enrolment");
  }

  async setEnrollmentStatus(enrollmentId: string, status: EnrollmentStatus): Promise<ClassEnrollment> {
    const { data, error } = await this.sb
      .from("class_enrollments")
      .update({ status })
      .eq("id", enrollmentId)
      .select("*, member:members(full_name, member_code, photo_url)")
      .single();
    throwIfError(error, "Unable to update enrolment");
    return mapEnrollment(data as EnrollmentRow);
  }

  /* ----------------------------- notifications ----------------------- */

  async listNotifications(filter: { unreadOnly?: boolean; limit?: number } = {}): Promise<AppNotification[]> {
    let request = this.sb.from("notifications").select("*");
    if (filter.unreadOnly) request = request.eq("is_read", false);
    const { data, error } = await request.order("created_at", { ascending: false }).limit(filter.limit ?? 100);
    throwIfError(error, "Unable to load notifications");
    return ((data ?? []) as NotificationRow[]).map(mapNotification);
  }

  async getUnreadNotificationCount(): Promise<number> {
    const { count, error } = await this.sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false);
    throwIfError(error, "Unable to count notifications");
    return count ?? 0;
  }

  async markNotificationRead(id: string): Promise<void> {
    const { error } = await this.sb.from("notifications").update({ is_read: true }).eq("id", id);
    throwIfError(error, "Unable to update notification");
  }

  async markAllNotificationsRead(): Promise<void> {
    const { error } = await this.sb.from("notifications").update({ is_read: true }).eq("is_read", false);
    throwIfError(error, "Unable to update notifications");
  }

  async generateNotifications(): Promise<number> {
    const { data, error } = await this.sb.rpc("generate_expiry_notifications");
    if (error) return 0; // Notification generation is a background nicety; never block the UI.
    return typeof data === "number" ? data : 0;
  }

  async listAuditLogs(limit = 50): Promise<AuditLog[]> {
    const { data, error } = await this.sb
      .from("audit_logs")
      .select("*, actor:profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(limit);
    throwIfError(error, "Unable to load audit logs");
    return ((data ?? []) as AuditRow[]).map(mapAudit);
  }

  /* ------------------------- internal re-exports --------------------- */

  async getCurrentMembershipFor(memberId: string): Promise<MemberMembership | null> {
    const history = await this.getMembershipHistory(memberId);
    return currentMembership(history);
  }

  async computeRenewalStart(memberId: string): Promise<string> {
    const current = await this.getCurrentMembershipFor(memberId);
    return renewalStartDate(new Date(), current, await this.tz());
  }

  async previewPlanEndDate(startDate: string, planId: string): Promise<string> {
    const plans = await this.listPlans();
    const plan = plans.find((p) => p.id === planId);
    if (!plan) throw new DataError("not_found", "Plan not found");
    return computeEndDate(parseDateOnly(startDate), plan.durationValue, plan.durationUnit)
      .toISOString()
      .slice(0, 10);
  }
}
