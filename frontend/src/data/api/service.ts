import type {
  AppNotification,
  AttendanceRecord,
  AttendanceReportSummary,
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
  PaymentQuery,
  PaymentRecord,
  PeakHour,
  PlanDistribution,
  Profile,
  RevenueSummary,
  StaffProfile,
  StoredMembershipStatus,
  UserRole,
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
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/data/api/client";
import { daysRemaining, effectiveStatus } from "@/lib/membership";
import { gymTimezone } from "@/lib/datetime";

/* ------------------------------------------------------------------ */
/*  API payload shapes (camelCase, matching the REST contract)         */
/* ------------------------------------------------------------------ */

export interface ApiUser {
  id: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  gymId: string;
  avatarUrl?: string | null;
  phone?: string | null;
}

/** Profile as the API knows it — we fill the UI-only fields client-side. */
export type ApiProfile = Omit<Profile, "isActive" | "lastLoginAt" | "createdAt" | "updatedAt"> &
  Partial<Pick<Profile, "isActive" | "lastLoginAt" | "createdAt" | "updatedAt">>;

interface RawCheckInResponse {
  status: "ok" | "rejected";
  reason?: string;
  message?: string;
  warning?: string;
  attendance?: AttendanceRecord;
  member?: CheckInMemberSummary;
}

/* ------------------------------------------------------------------ */
/*  Cached gym (shared by the auth + data services)                    */
/* ------------------------------------------------------------------ */

let gymCache: Promise<Gym> | null = null;

export function loadGym(): Promise<Gym> {
  if (!gymCache) {
    gymCache = apiGet<Gym>("/gym").catch((err: unknown) => {
      gymCache = null;
      throw err;
    });
  }
  return gymCache;
}

export function invalidateGymCache(): void {
  gymCache = null;
}

/* ------------------------------------------------------------------ */
/*  Data service                                                       */
/* ------------------------------------------------------------------ */

/**
 * REST implementation of the `DataService` contract.
 *
 * The backend returns camelCase domain shapes; anything the UI derives
 * (effectiveStatus, daysRemaining, planName, endDate) is recomputed here with
 * the same `@/lib/membership` helpers the demo service uses, unless the API
 * already sent it.
 */
export class ApiDataService implements DataService {
  /** Literal is "api"; typed as the contract's union because `src/data/types.ts` is frozen. */
  readonly mode = "api" as const;

  private readonly gymId: string;
  /** Promise-cached so concurrent callers share ONE request (a null-reset on failure retries next call). */
  private settingsPromise: Promise<GymSettings> | null = null;
  private plansPromise: Promise<MembershipPlan[]> | null = null;

  constructor(gymId: string) {
    this.gymId = gymId;
  }

  /* ------------------------------ plumbing --------------------------- */

  private async tz(): Promise<string> {
    try {
      const gym = await loadGym();
      return gym.timezone || gymTimezone;
    } catch {
      return gymTimezone;
    }
  }

  private async settings(): Promise<GymSettings> {
    if (!this.settingsPromise) {
      this.settingsPromise = apiGet<GymSettings>("/settings").catch(() => {
        // Never let decoration crash a page — fall back to documented defaults.
        this.settingsPromise = null; // retry on the next call
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
          updatedAt: new Date().toISOString(),
        } satisfies GymSettings;
      });
    }
    return this.settingsPromise;
  }

  private async plans(): Promise<MembershipPlan[]> {
    if (!this.plansPromise) {
      this.plansPromise = apiGet<MembershipPlan[]>("/plans", { includeInactive: 1 }).catch((err) => {
        this.plansPromise = null; // retry on the next call
        throw err;
      });
    }
    return this.plansPromise;
  }

  /** Fill in plan names on a membership row when the API did not join them. */
  private async decorateMembership(row: MemberMembership | null): Promise<MemberMembership | null> {
    if (!row || row.planName) return row;
    try {
      const plans = await this.plans();
      const plan = plans.find((p) => p.id === row.planId);
      if (plan) {
        return {
          ...row,
          planName: plan.name,
          planDurationValue: plan.durationValue,
          planDurationUnit: plan.durationUnit,
        };
      }
    } catch {
      /* plan lookup is best-effort decoration */
    }
    return row;
  }

  private async decorateMember(row: Member & Partial<MemberWithMembership>): Promise<MemberWithMembership> {
    const [settings, tz] = await Promise.all([this.settings(), this.tz()]);
    const membership = await this.decorateMembership(row.membership ?? null);
    return {
      ...(row as Member),
      membership,
      effectiveStatus:
        row.effectiveStatus ?? effectiveStatus(membership, row.status, new Date(), settings.expiringSoonDays, tz),
      planName: row.planName ?? membership?.planName ?? null,
      endDate: row.endDate ?? membership?.endDate ?? null,
      daysRemaining: row.daysRemaining ?? daysRemaining(membership, new Date(), tz),
    };
  }

  private async decorateMembers(rows: Array<Member & Partial<MemberWithMembership>>): Promise<MemberWithMembership[]> {
    return Promise.all(rows.map((row) => this.decorateMember(row)));
  }

  private async decoratePaginatedMembers(payload: unknown): Promise<Paginated<MemberWithMembership>> {
    const page = this.paginatedOf<Member & Partial<MemberWithMembership>>(payload, 10);
    return { ...page, items: await this.decorateMembers(page.items) };
  }

  /** Accept `{items,total,page,pageSize}` — or a bare array for defensive robustness. */
  private paginatedOf<T>(payload: unknown, fallbackPageSize: number): Paginated<T> {
    if (Array.isArray(payload)) {
      const items = payload as T[];
      return { items, total: items.length, page: 1, pageSize: items.length || fallbackPageSize };
    }
    const record = (payload ?? {}) as { items?: unknown; total?: unknown; page?: unknown; pageSize?: unknown };
    return {
      items: Array.isArray(record.items) ? (record.items as T[]) : [],
      total: typeof record.total === "number" ? record.total : 0,
      page: typeof record.page === "number" ? record.page : 1,
      pageSize: typeof record.pageSize === "number" ? record.pageSize : fallbackPageSize,
    };
  }

  private async isNotFound(err: unknown): Promise<boolean> {
    return err instanceof ApiError && err.status === 404;
  }

  private notSupported(what: string): never {
    throw new DataError("not_supported", `${what} is not supported by the API yet.`);
  }

  /* ----------------------------- settings ---------------------------- */

  async getGym(): Promise<Gym> {
    return loadGym();
  }

  async getSettings(): Promise<GymSettings> {
    return this.settings();
  }

  async updateSettings(patch: GymSettingsPatch): Promise<GymSettings> {
    const updated = await apiPatch<GymSettings>("/settings", patch);
    this.settingsPromise = Promise.resolve(updated);
    // Gym-level fields (name/timezone) may have changed too — force a refetch.
    invalidateGymCache();
    return updated;
  }

  /* ----------------------------- dashboard --------------------------- */

  async getDashboardStats(): Promise<DashboardStats> {
    return apiGet<DashboardStats>("/dashboard/stats");
  }

  async getAttendanceTrend(days: number): Promise<DayCount[]> {
    return apiGet<DayCount[]>("/dashboard/attendance-trend", { days });
  }

  async getRevenueTrend(months: number): Promise<MonthRevenue[]> {
    return apiGet<MonthRevenue[]>("/dashboard/revenue-trend", { months });
  }

  async getPlanDistribution(): Promise<PlanDistribution[]> {
    return apiGet<PlanDistribution[]>("/dashboard/plan-distribution");
  }

  async getRecentCheckIns(limit: number): Promise<AttendanceRecord[]> {
    return apiGet<AttendanceRecord[]>("/dashboard/recent-checkins", { limit });
  }

  async getRecentMembers(limit: number): Promise<MemberWithMembership[]> {
    const rows = await apiGet<Array<Member & Partial<MemberWithMembership>>>("/dashboard/recent-members", { limit });
    return this.decorateMembers(rows ?? []);
  }

  async getUpcomingExpiries(limit: number): Promise<MemberWithMembership[]> {
    const rows = await apiGet<Array<Member & Partial<MemberWithMembership>>>("/dashboard/upcoming-expiries", { limit });
    return this.decorateMembers(rows ?? []);
  }

  /* ------------------------------ members ---------------------------- */

  async listMembers(query: MemberQuery = {}): Promise<Paginated<MemberWithMembership>> {
    const payload = await apiGet<unknown>("/members", {
      search: query.search,
      status: query.status && query.status !== "all" ? query.status : undefined,
      planId: query.planId,
      sort: query.sort,
      dir: query.dir,
      page: query.page,
      pageSize: query.pageSize,
    });
    return this.decoratePaginatedMembers(payload);
  }

  async listAllMembers(): Promise<MemberWithMembership[]> {
    const out: MemberWithMembership[] = [];
    const pageSize = 100;
    for (let page = 1; page <= 100; page += 1) {
      const payload = await apiGet<unknown>("/members", { page, pageSize });
      const chunk = await this.decoratePaginatedMembers(payload);
      out.push(...chunk.items);
      if (out.length >= chunk.total || chunk.items.length === 0) break;
    }
    return out;
  }

  async getMember(id: string): Promise<MemberWithMembership | null> {
    try {
      const row = await apiGet<Member & Partial<MemberWithMembership>>(`/members/${encodeURIComponent(id)}`);
      return this.decorateMember(row);
    } catch (err) {
      if (await this.isNotFound(err)) return null;
      throw err;
    }
  }

  async createMember(input: MemberCreateInput): Promise<MemberWithMembership> {
    const row = await apiPost<Member & Partial<MemberWithMembership>>("/members", input);
    return this.decorateMember(row);
  }

  async updateMember(id: string, input: MemberUpdateInput): Promise<MemberWithMembership> {
    const row = await apiPatch<Member & Partial<MemberWithMembership>>(`/members/${encodeURIComponent(id)}`, input);
    return this.decorateMember(row);
  }

  async deleteMember(id: string): Promise<void> {
    await apiDelete<void>(`/members/${encodeURIComponent(id)}`);
  }

  async setMemberStatus(id: string, status: MemberStatus): Promise<MemberWithMembership> {
    const row = await apiPatch<Member & Partial<MemberWithMembership>>(`/members/${encodeURIComponent(id)}/status`, { status });
    return this.decorateMember(row);
  }

  async getMembershipHistory(memberId: string): Promise<MemberMembership[]> {
    const rows = await apiGet<MemberMembership[]>(`/members/${encodeURIComponent(memberId)}/memberships`);
    return Promise.all((rows ?? []).map((row) => this.decorateMembership(row).then((m) => m ?? row)));
  }

  async renewMembership(input: RenewMembershipInput): Promise<MemberMembership> {
    const { memberId, ...body } = input;
    const row = await apiPost<MemberMembership>(`/members/${encodeURIComponent(memberId)}/renew`, body);
    return this.decorateMembership(row).then((m) => m ?? row);
  }

  async setMembershipStatus(
    membershipId: string,
    status: StoredMembershipStatus,
    notes?: string | null,
  ): Promise<MemberMembership> {
    void membershipId;
    void status;
    void notes;
    // No endpoint exists for this in the REST contract yet.
    return this.notSupported("Changing a membership's stored status");
  }

  async rotateQrToken(memberId: string): Promise<Member> {
    return apiPost<Member>(`/members/${encodeURIComponent(memberId)}/rotate-qr`);
  }

  /* ------------------------------- plans ----------------------------- */

  async listPlans(includeInactive = true): Promise<MembershipPlan[]> {
    const rows = await apiGet<MembershipPlan[]>("/plans", { includeInactive: includeInactive ? 1 : undefined });
    return rows ?? [];
  }

  async createPlan(input: PlanCreateInput): Promise<MembershipPlan> {
    this.plansPromise = null;
    return apiPost<MembershipPlan>("/plans", input);
  }

  async updatePlan(id: string, input: PlanUpdateInput): Promise<MembershipPlan> {
    this.plansPromise = null;
    return apiPatch<MembershipPlan>(`/plans/${encodeURIComponent(id)}`, input);
  }

  async archivePlan(id: string, isActive: boolean): Promise<MembershipPlan> {
    this.plansPromise = null;
    return apiPatch<MembershipPlan>(`/plans/${encodeURIComponent(id)}/active`, { isActive });
  }

  /* ---------------------------- attendance --------------------------- */

  private normalizeCheckIn(payload: unknown): CheckInResult {
    const result = payload as RawCheckInResponse | null;
    if (result && (result.status === "ok" || result.status === "rejected")) {
      return result as unknown as CheckInResult;
    }
    throw new ApiError(500, "server_error", "The server returned an unexpected check-in response.");
  }

  async checkInByToken(token: string, ctx?: ScanContext): Promise<CheckInResult> {
    const payload = await apiPost<unknown>("/attendance/checkin", {
      token,
      method: ctx?.method,
      notes: ctx?.notes ?? undefined,
    });
    return this.normalizeCheckIn(payload);
  }

  async checkInByMemberCode(code: string, ctx?: ScanContext): Promise<CheckInResult> {
    const payload = await apiPost<unknown>("/attendance/checkin-code", {
      code,
      method: ctx?.method,
      notes: ctx?.notes ?? undefined,
    });
    return this.normalizeCheckIn(payload);
  }

  async recordCheckout(attendanceId: string): Promise<AttendanceRecord> {
    return apiPost<AttendanceRecord>(`/attendance/${encodeURIComponent(attendanceId)}/checkout`);
  }

  async listAttendance(query: import("@/types").AttendanceQuery = {}): Promise<Paginated<AttendanceRecord>> {
    const payload = await apiGet<unknown>("/attendance", {
      from: query.from,
      to: query.to,
      memberId: query.memberId,
      status: query.status && query.status !== "all" ? query.status : undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
    return this.paginatedOf<AttendanceRecord>(payload, 20);
  }

  async listMemberAttendance(memberId: string, limit = 30): Promise<AttendanceRecord[]> {
    const rows = await apiGet<AttendanceRecord[]>(`/members/${encodeURIComponent(memberId)}/attendance`, { limit });
    return rows ?? [];
  }

  async correctAttendance(id: string, patch: AttendanceCorrectionInput): Promise<AttendanceRecord> {
    return apiPatch<AttendanceRecord>(`/attendance/${encodeURIComponent(id)}`, patch);
  }

  private rangeQuery(range: AttendanceRange): Record<string, string> {
    return { from: range.from.toISOString(), to: range.to.toISOString() };
  }

  async getAttendanceSummary(range: AttendanceRange): Promise<AttendanceReportSummary> {
    return apiGet<AttendanceReportSummary>("/attendance/summary", this.rangeQuery(range));
  }

  async getPeakHours(range: AttendanceRange): Promise<PeakHour[]> {
    const rows = await apiGet<PeakHour[]>("/attendance/peak-hours", this.rangeQuery(range));
    // The chart also renders `label`; compute it if the API omitted it.
    return (rows ?? []).map((row) => ({
      ...row,
      label: row.label ?? `${row.hour % 12 === 0 ? 12 : row.hour % 12}${row.hour < 12 ? "a" : "p"}`,
    }));
  }

  async getMemberFrequencies(range: AttendanceRange, limit: number): Promise<MemberFrequency[]> {
    const rows = await apiGet<MemberFrequency[]>("/attendance/frequencies", { ...this.rangeQuery(range), limit });
    return rows ?? [];
  }

  /* ------------------------------ payments --------------------------- */

  async listPayments(query: PaymentQuery = {}): Promise<Paginated<PaymentRecord>> {
    const payload = await apiGet<unknown>("/payments", {
      search: query.search,
      from: query.from,
      to: query.to,
      status: query.status && query.status !== "all" ? query.status : undefined,
      method: query.method && query.method !== "all" ? query.method : undefined,
      memberId: query.memberId,
      page: query.page,
      pageSize: query.pageSize,
    });
    return this.paginatedOf<PaymentRecord>(payload, 15);
  }

  async createPayment(input: PaymentCreateInput): Promise<PaymentRecord> {
    return apiPost<PaymentRecord>("/payments", input);
  }

  async refundPayment(paymentId: string, amount: number, reason: string): Promise<PaymentRecord> {
    return apiPost<PaymentRecord>(`/payments/${encodeURIComponent(paymentId)}/refund`, { amount, reason });
  }

  async getDues(): Promise<DuesRow[]> {
    return apiGet<DuesRow[]>("/payments/dues");
  }

  async getRevenueSummary(months: number): Promise<RevenueSummary[]> {
    return apiGet<RevenueSummary[]>("/payments/revenue", { months });
  }

  /* -------------------------------- staff ---------------------------- */

  async listStaff(includeInactive = true): Promise<StaffProfile[]> {
    const rows = await apiGet<StaffProfile[]>("/staff", { includeInactive: includeInactive ? 1 : undefined });
    return rows ?? [];
  }

  async createStaff(input: StaffCreateInput): Promise<StaffProfile> {
    return apiPost<StaffProfile>("/staff", input);
  }

  async updateStaff(id: string, input: StaffUpdateInput): Promise<StaffProfile> {
    return apiPatch<StaffProfile>(`/staff/${encodeURIComponent(id)}`, input);
  }

  async archiveStaff(id: string): Promise<StaffProfile> {
    return apiPatch<StaffProfile>(`/staff/${encodeURIComponent(id)}/archive`);
  }

  /* ------------------------------- classes --------------------------- */

  async listClasses(from: Date, to: Date): Promise<GymClass[]> {
    const rows = await apiGet<GymClass[]>("/classes", { from: from.toISOString(), to: to.toISOString() });
    return rows ?? [];
  }

  async getClass(id: string): Promise<GymClass | null> {
    try {
      return await apiGet<GymClass>(`/classes/${encodeURIComponent(id)}`);
    } catch (err) {
      if (await this.isNotFound(err)) return null;
      throw err;
    }
  }

  async createClass(input: ClassCreateInput): Promise<GymClass> {
    return apiPost<GymClass>("/classes", input);
  }

  async updateClass(id: string, input: ClassUpdateInput): Promise<GymClass> {
    return apiPatch<GymClass>(`/classes/${encodeURIComponent(id)}`, input);
  }

  async cancelClass(id: string): Promise<GymClass> {
    return apiPatch<GymClass>(`/classes/${encodeURIComponent(id)}/cancel`);
  }

  async listEnrollments(classId: string): Promise<ClassEnrollment[]> {
    const rows = await apiGet<ClassEnrollment[]>(`/classes/${encodeURIComponent(classId)}/enrollments`);
    return rows ?? [];
  }

  async enroll(classId: string, memberId: string): Promise<ClassEnrollment> {
    return apiPost<ClassEnrollment>(`/classes/${encodeURIComponent(classId)}/enroll`, { memberId });
  }

  async cancelEnrollment(enrollmentId: string): Promise<void> {
    await apiDelete<void>(`/enrollments/${encodeURIComponent(enrollmentId)}`);
  }

  async setEnrollmentStatus(enrollmentId: string, status: EnrollmentStatus): Promise<ClassEnrollment> {
    return apiPatch<ClassEnrollment>(`/enrollments/${encodeURIComponent(enrollmentId)}/status`, { status });
  }

  /* --------------------------- notifications ------------------------- */

  async listNotifications(filter: { unreadOnly?: boolean; limit?: number } = {}): Promise<AppNotification[]> {
    const rows = await apiGet<AppNotification[]>("/notifications", {
      unreadOnly: filter.unreadOnly ? 1 : undefined,
      limit: filter.limit,
    });
    return rows ?? [];
  }

  async getUnreadNotificationCount(): Promise<number> {
    const payload = await apiGet<{ count?: number }>("/notifications/unread-count");
    return typeof payload?.count === "number" ? payload.count : 0;
  }

  async markNotificationRead(id: string): Promise<void> {
    await apiPatch<void>(`/notifications/${encodeURIComponent(id)}/read`);
  }

  async markAllNotificationsRead(): Promise<void> {
    await apiPost<void>("/notifications/read-all");
  }

  async generateNotifications(): Promise<number> {
    const payload = await apiPost<{ created?: number }>("/notifications/rebuild");
    return typeof payload?.created === "number" ? payload.created : 0;
  }

  /* -------------------------------- audit ---------------------------- */

  async listAuditLogs(limit = 50): Promise<AuditLog[]> {
    const rows = await apiGet<AuditLog[]>("/audit", { limit });
    return rows ?? [];
  }
}
