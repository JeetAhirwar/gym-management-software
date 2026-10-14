/**
 * Domain types shared across the whole application.
 * Field names are camelCase — the API returns these shapes directly.
 */

export type UserRole = "owner" | "admin" | "front_desk" | "trainer" | "member";

export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

/** Stored membership state (never derived). */
export type StoredMembershipStatus = "active" | "suspended" | "inactive" | "cancelled";

/** API-contract name for the stored membership status. */
export type MembershipStatus = StoredMembershipStatus;

/**
 * Effective status shown across the UI: stored state + date math in gym timezone.
 */
export type EffectiveMembershipStatus =
  | "active"
  | "expiring_soon"
  | "expired"
  | "suspended"
  | "inactive"
  | "cancelled"
  | "none";

export type MemberStatus = "active" | "inactive";

export type DurationUnit = "day" | "week" | "month" | "year";

export type PaymentMethod = "cash" | "upi" | "card" | "bank_transfer" | "other";

export type PaymentStatus = "paid" | "partial" | "pending" | "refunded" | "failed";

export type AttendanceStatus = "checked_in" | "checked_out";

export type AttendanceMethod = "qr" | "manual" | "class";

export type EmploymentStatus = "active" | "on_leave" | "resigned";

export type ClassStatus = "scheduled" | "cancelled" | "completed";

export type EnrollmentStatus = "enrolled" | "cancelled" | "attended" | "no_show";

export type NotificationType =
  | "expiry_warning"
  | "membership_expired"
  | "payment_pending"
  | "checkin_success"
  | "checkin_rejected"
  | "class_reminder"
  | "general";

export type Severity = "info" | "success" | "warning" | "error";

export interface Gym {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  gymId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GymSettings {
  gymId: string;
  /** Minimum minutes between two accepted check-ins for the same member. */
  checkinCooldownMinutes: number;
  trackCheckout: boolean;
  expiringSoonDays: number;
  expiryReminderDays: number[];
  allowExpiredCheckin: boolean;
  enableEmail: boolean;
  enableSms: boolean;
  enableWhatsapp: boolean;
  enablePush: boolean;
  attendanceRetentionDays: number;
  updatedAt: string;
}

export interface MembershipPlan {
  id: string;
  gymId: string;
  name: string;
  description: string | null;
  price: number;
  durationValue: number;
  durationUnit: DurationUnit;
  benefits: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemberMembership {
  id: string;
  gymId: string;
  memberId: string;
  planId: string;
  startDate: string;
  endDate: string;
  status: StoredMembershipStatus;
  price: number;
  discount: number;
  source: "new" | "renewal" | "extension" | "correction";
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Denormalised for convenience (joined by the data layer). */
  planName?: string | null;
  planDurationValue?: number | null;
  planDurationUnit?: DurationUnit | null;
}

export interface Member {
  id: string;
  gymId: string;
  memberCode: string;
  fullName: string;
  email: string | null;
  phone: string;
  photoUrl: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  joinDate: string;
  qrToken: string;
  qrStatus: "active" | "revoked";
  qrRotatedAt: string | null;
  status: MemberStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Member joined with its current membership + derived status (list/detail view). */
export interface MemberWithMembership extends Member {
  membership: MemberMembership | null;
  effectiveStatus: EffectiveMembershipStatus;
  planName: string | null;
  endDate: string | null;
  daysRemaining: number | null;
}

/* ------------------------------------------------------------------ */
/*  Member self-service portal                                         */
/* ------------------------------------------------------------------ */

/** The signed-in member's current membership as served by GET /api/me. */
export interface MyMembership {
  id: string;
  planId: string;
  planName: string | null;
  planDurationValue: number | null;
  planDurationUnit: DurationUnit | null;
  startDate: string;
  endDate: string;
  status: MembershipStatus;
  price: number;
}

/** Everything a member may see about themselves — never anyone else's data. */
export interface MyMemberProfile {
  id: string;
  memberCode: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  joinDate: string;
  status: MemberStatus;
  qrStatus: "active" | "revoked";
  membership: MyMembership | null;
  effectiveStatus: "active" | "expiring_soon" | "expired" | "suspended" | "none";
  daysRemaining: number | null;
}

export interface AttendanceRecord {
  id: string;
  gymId: string;
  memberId: string;
  membershipId: string | null;
  checkIn: string;
  checkOut: string | null;
  status: AttendanceStatus;
  method: AttendanceMethod;
  scannerId: string | null;
  notes: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** Joined fields for display. */
  memberName?: string;
  memberCode?: string;
  memberPhoto?: string | null;
  scannerName?: string | null;
}

export interface PaymentRecord {
  id: string;
  gymId: string;
  memberId: string;
  membershipId: string | null;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionRef: string | null;
  notes: string | null;
  receiptNo: string;
  recordedBy: string | null;
  refundOf: string | null;
  createdAt: string;
  updatedAt: string;
  memberName?: string;
  memberCode?: string;
  membershipSummary?: string | null;
}

export interface StaffProfile {
  id: string;
  gymId: string;
  profileId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  /** Staff rows are never member accounts — the portal role can't appear here. */
  role: Exclude<UserRole, "member">;
  specialization: string | null;
  employmentStatus: EmploymentStatus;
  joiningDate: string;
  photoUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GymClass {
  id: string;
  gymId: string;
  name: string;
  description: string | null;
  trainerId: string | null;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  status: ClassStatus;
  createdAt: string;
  updatedAt: string;
  trainerName?: string | null;
  enrolledCount?: number;
}

export interface ClassEnrollment {
  id: string;
  gymId: string;
  classId: string;
  memberId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  createdAt: string;
  updatedAt: string;
  memberName?: string;
  memberCode?: string;
  memberPhoto?: string | null;
}

export interface AppNotification {
  id: string;
  gymId: string;
  userId: string | null;
  memberId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  severity: Severity;
  isRead: boolean;
  dedupeKey: string | null;
  link: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  gymId: string;
  actorId: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: string;
  actorName?: string | null;
}

/* ------------------------------------------------------------------ */
/*  QR attendance                                                      */
/* ------------------------------------------------------------------ */

export type CheckInRejectionReason =
  | "invalid_qr"
  | "revoked_qr"
  | "member_inactive"
  | "no_membership"
  | "expired"
  | "suspended"
  | "cooldown"
  | "duplicate"
  | "forbidden"
  | "not_found"
  | "network"
  | "server_error";

export interface CheckInMemberSummary {
  id: string;
  memberCode: string;
  fullName: string;
  photoUrl: string | null;
  planName: string | null;
  membershipEnd: string | null;
  effectiveStatus: EffectiveMembershipStatus;
}

export type CheckInResult =
  | {
      status: "ok";
      attendance: AttendanceRecord;
      member: CheckInMemberSummary;
      warning?: string;
    }
  | {
      status: "rejected";
      reason: CheckInRejectionReason;
      message: string;
      /** Minimal identifying info — only ever shown to authenticated staff. */
      member?: CheckInMemberSummary;
    };

/* ------------------------------------------------------------------ */
/*  Query / pagination helpers                                         */
/* ------------------------------------------------------------------ */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type MemberStatusFilter =
  | "all"
  | "active"
  | "expiring_soon"
  | "expired"
  | "suspended"
  | "inactive";

export interface MemberQuery {
  search?: string;
  status?: MemberStatusFilter;
  planId?: string;
  sort?: "name" | "joined" | "expiry" | "created";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface AttendanceQuery {
  from?: string;
  to?: string;
  memberId?: string;
  status?: "all" | AttendanceStatus;
  page?: number;
  pageSize?: number;
}

export interface PaymentQuery {
  search?: string;
  from?: string;
  to?: string;
  status?: PaymentStatus | "all";
  method?: PaymentMethod | "all";
  memberId?: string;
  page?: number;
  pageSize?: number;
}

/* ------------------------------------------------------------------ */
/*  Dashboard & reports                                                */
/* ------------------------------------------------------------------ */

export interface DashboardStats {
  activeMembers: number;
  newThisMonth: number;
  expiredMembers: number;
  expiringSoon: number;
  todayAttendance: number;
  currentCheckIns: number;
  monthlyRevenue: number;
  previousMonthRevenue: number;
  pendingPayments: number;
  pendingAmount: number;
  totalMembers: number;
}

export interface DayCount {
  date: string;
  count: number;
}

export interface MonthRevenue {
  month: string;
  label: string;
  revenue: number;
}

export interface PlanDistribution {
  planId: string;
  planName: string;
  count: number;
  value: number;
}

export interface PeakHour {
  hour: number;
  label: string;
  count: number;
}

export interface MemberFrequency {
  memberId: string;
  memberCode: string;
  memberName: string;
  visits: number;
}

export interface AttendanceReportSummary {
  totalVisits: number;
  uniqueMembers: number;
  averagePerDay: number;
  busiestHour: number | null;
  checkIns: number;
}

export interface RevenueSummary {
  month: string;
  label: string;
  collected: number;
  expected: number;
  outstanding: number;
  count: number;
}

export interface DuesRow {
  memberId: string;
  memberCode: string;
  memberName: string;
  membershipId: string;
  planName: string;
  endDate: string | null;
  billed: number;
  paid: number;
  balance: number;
}

/* ------------------------------------------------------------------ */
/*  Auth session                                                       */
/* ------------------------------------------------------------------ */

export interface AuthSession {
  userId: string;
  email: string | null;
  profile: Profile;
  gym: Gym;
  /** True when running on locally seeded demo data. */
  demo: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}
