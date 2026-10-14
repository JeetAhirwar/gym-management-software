import type {
  AppNotification,
  AttendanceMethod,
  AttendanceQuery,
  AttendanceRecord,
  AttendanceReportSummary,
  AuditLog,
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
  MyMemberProfile,
  Paginated,
  PaymentMethod,
  PaymentQuery,
  PaymentRecord,
  PaymentStatus,
  PeakHour,
  PlanDistribution,
  RevenueSummary,
  StaffProfile,
  StoredMembershipStatus,
} from "@/types";

/* ------------------------------------------------------------------ */
/*  Mutation inputs                                                     */
/* ------------------------------------------------------------------ */

export interface MemberCreateInput {
  fullName: string;
  email?: string | null;
  phone: string;
  photoUrl?: string | null;
  dateOfBirth?: string | null;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  joinDate: string;
  notes?: string | null;
  /** First membership assignment. */
  planId: string;
  membershipStart: string;
  /** Optional portal password for the member's own login (default: test@123). */
  loginPassword?: string;
  /** Optional first payment recorded together with the membership. */
  initialPayment?: {
    amount: number;
    method: PaymentMethod;
    paymentDate?: string;
    transactionRef?: string | null;
    notes?: string | null;
  } | null;
}

export type MemberUpdateInput = Partial<
  Omit<MemberCreateInput, "planId" | "membershipStart" | "initialPayment" | "loginPassword">
> & {
  status?: MemberStatus;
};

export interface RenewMembershipInput {
  memberId: string;
  planId: string;
  startDate?: string;
  discount?: number;
  notes?: string | null;
  source?: "new" | "renewal" | "extension" | "correction";
  initialPayment?: {
    amount: number;
    method: PaymentMethod;
    transactionRef?: string | null;
    notes?: string | null;
  } | null;
}

export interface PlanCreateInput {
  name: string;
  description?: string | null;
  price: number;
  durationValue: number;
  durationUnit: "day" | "week" | "month" | "year";
  benefits?: string[];
  isActive?: boolean;
  sortOrder?: number;
}

export type PlanUpdateInput = Partial<PlanCreateInput>;

export interface PaymentCreateInput {
  memberId: string;
  membershipId?: string | null;
  amount: number;
  method: PaymentMethod;
  paymentDate?: string;
  status?: Extract<PaymentStatus, "paid" | "partial" | "pending">;
  transactionRef?: string | null;
  notes?: string | null;
  /** Client-supplied idempotency key to guard against double submissions. */
  idempotencyKey?: string;
}

export interface StaffCreateInput {
  fullName: string;
  email?: string | null;
  phone: string;
  role: "admin" | "front_desk" | "trainer";
  specialization?: string | null;
  employmentStatus: "active" | "on_leave" | "resigned";
  joiningDate: string;
  photoUrl?: string | null;
  notes?: string | null;
}

export type StaffUpdateInput = Partial<StaffCreateInput>;

export interface ClassCreateInput {
  name: string;
  description?: string | null;
  trainerId?: string | null;
  /** ISO datetime */
  startsAt: string;
  durationMinutes: number;
  capacity: number;
}

export type ClassUpdateInput = Partial<ClassCreateInput>;

export interface AttendanceCorrectionInput {
  checkIn?: string;
  checkOut?: string | null;
  notes?: string | null;
}

export interface ScanContext {
  method?: AttendanceMethod;
  notes?: string | null;
}

/** Settings patch — allows editing gym profile fields alongside settings. */
export interface GymSettingsPatch extends Partial<GymSettings> {
  gymName?: string;
  timezone?: string;
}

export interface AttendanceRange {
  from: Date;
  to: Date;
}

/* ------------------------------------------------------------------ */
/*  Service contract                                                    */
/* ------------------------------------------------------------------ */

export interface DataService {
  readonly mode: "api" | "demo";

  /* settings & gym */
  getGym(): Promise<Gym>;
  getSettings(): Promise<GymSettings>;
  updateSettings(patch: GymSettingsPatch): Promise<GymSettings>;

  /* dashboard */
  getDashboardStats(): Promise<DashboardStats>;
  getAttendanceTrend(days: number): Promise<DayCount[]>;
  getRevenueTrend(months: number): Promise<MonthRevenue[]>;
  getPlanDistribution(): Promise<PlanDistribution[]>;
  getRecentCheckIns(limit: number): Promise<AttendanceRecord[]>;
  getRecentMembers(limit: number): Promise<MemberWithMembership[]>;
  getUpcomingExpiries(limit: number): Promise<MemberWithMembership[]>;

  /* members */
  listMembers(query?: MemberQuery): Promise<Paginated<MemberWithMembership>>;
  listAllMembers(): Promise<MemberWithMembership[]>;
  getMember(id: string): Promise<MemberWithMembership | null>;
  createMember(input: MemberCreateInput): Promise<MemberWithMembership>;
  updateMember(id: string, input: MemberUpdateInput): Promise<MemberWithMembership>;
  deleteMember(id: string): Promise<void>;
  setMemberStatus(id: string, status: MemberStatus): Promise<MemberWithMembership>;
  getMembershipHistory(memberId: string): Promise<MemberMembership[]>;
  renewMembership(input: RenewMembershipInput): Promise<MemberMembership>;
  setMembershipStatus(
    membershipId: string,
    status: StoredMembershipStatus,
    notes?: string | null,
  ): Promise<MemberMembership>;
  rotateQrToken(memberId: string): Promise<Member>;

  /* plans */
  listPlans(includeInactive?: boolean): Promise<MembershipPlan[]>;
  createPlan(input: PlanCreateInput): Promise<MembershipPlan>;
  updatePlan(id: string, input: PlanUpdateInput): Promise<MembershipPlan>;
  archivePlan(id: string, isActive: boolean): Promise<MembershipPlan>;

  /* attendance */
  checkInByToken(token: string, ctx?: ScanContext): Promise<CheckInResult>;
  checkInByMemberCode(code: string, ctx?: ScanContext): Promise<CheckInResult>;
  recordCheckout(attendanceId: string): Promise<AttendanceRecord>;
  listAttendance(query?: AttendanceQuery): Promise<Paginated<AttendanceRecord>>;
  listMemberAttendance(memberId: string, limit?: number): Promise<AttendanceRecord[]>;
  correctAttendance(id: string, patch: AttendanceCorrectionInput): Promise<AttendanceRecord>;
  getAttendanceSummary(range: AttendanceRange): Promise<AttendanceReportSummary>;
  getPeakHours(range: AttendanceRange): Promise<PeakHour[]>;
  getMemberFrequencies(range: AttendanceRange, limit: number): Promise<MemberFrequency[]>;

  /* payments */
  listPayments(query?: PaymentQuery): Promise<Paginated<PaymentRecord>>;
  createPayment(input: PaymentCreateInput): Promise<PaymentRecord>;
  refundPayment(paymentId: string, amount: number, reason: string): Promise<PaymentRecord>;
  getDues(): Promise<DuesRow[]>;
  getRevenueSummary(months: number): Promise<RevenueSummary[]>;

  /* member self-service portal (scoped to the signed-in member's own data) */
  getMyMemberProfile(): Promise<MyMemberProfile>;
  getMyQr(): Promise<{ token: string; status: "active" | "revoked" }>;
  listMyAttendance(limit?: number): Promise<AttendanceRecord[]>;
  listMyPayments(): Promise<PaymentRecord[]>;
  changeMyPassword(currentPassword: string, newPassword: string): Promise<void>;

  /* staff */
  listStaff(includeInactive?: boolean): Promise<StaffProfile[]>;
  createStaff(input: StaffCreateInput): Promise<StaffProfile>;
  updateStaff(id: string, input: StaffUpdateInput): Promise<StaffProfile>;
  archiveStaff(id: string): Promise<StaffProfile>;

  /* classes */
  listClasses(from: Date, to: Date): Promise<GymClass[]>;
  getClass(id: string): Promise<GymClass | null>;
  createClass(input: ClassCreateInput): Promise<GymClass>;
  updateClass(id: string, input: ClassUpdateInput): Promise<GymClass>;
  cancelClass(id: string): Promise<GymClass>;
  listEnrollments(classId: string): Promise<ClassEnrollment[]>;
  enroll(classId: string, memberId: string): Promise<ClassEnrollment>;
  cancelEnrollment(enrollmentId: string): Promise<void>;
  setEnrollmentStatus(enrollmentId: string, status: EnrollmentStatus): Promise<ClassEnrollment>;

  /* notifications */
  listNotifications(filter?: { unreadOnly?: boolean; limit?: number }): Promise<AppNotification[]>;
  getUnreadNotificationCount(): Promise<number>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  /** Recomputes expiry / dues notifications. Returns how many were created. */
  generateNotifications(): Promise<number>;

  /* audit */
  listAuditLogs(limit?: number): Promise<AuditLog[]>;
}

export interface AuthProvider {
  readonly mode: "api" | "demo";
  getSession(): Promise<import("@/types").AuthSession | null>;
  signIn(email: string, password: string): Promise<import("@/types").AuthSession>;
  /** Members authenticate with their member code (e.g. "PG-0001") + password. */
  signInMember(memberCode: string, password: string): Promise<import("@/types").AuthSession>;
  signOut(): Promise<void>;
  onAuthChange(cb: (session: import("@/types").AuthSession | null) => void): () => void;
}

/** Thrown by data layer for expected, user-facing failures. */
export class DataError extends Error {
  readonly code: string;
  readonly detail?: Record<string, unknown>;
  constructor(code: string, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "DataError";
    this.code = code;
    this.detail = detail;
  }
}

export function isDataError(error: unknown): error is DataError {
  return error instanceof DataError;
}
