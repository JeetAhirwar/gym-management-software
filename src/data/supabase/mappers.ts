import type {
  AppNotification,
  AttendanceMethod,
  AttendanceRecord,
  AttendanceStatus,
  AuditLog,
  ClassEnrollment,
  ClassStatus,
  DurationUnit,
  EmploymentStatus,
  EnrollmentStatus,
  Gender,
  Gym,
  GymClass,
  GymSettings,
  Member,
  MemberMembership,
  MemberStatus,
  MembershipPlan,
  NotificationType,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  Profile,
  Severity,
  StaffProfile,
  StoredMembershipStatus,
  UserRole,
} from "@/types";

/** Raw Postgres row shapes (snake_case) produced by the migrations. */

export interface GymRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  gym_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GymSettingsRow {
  gym_id: string;
  checkin_cooldown_minutes: number;
  track_checkout: boolean;
  expiring_soon_days: number;
  expiry_reminder_days: number[];
  allow_expired_checkin: boolean;
  enable_email: boolean;
  enable_sms: boolean;
  enable_whatsapp: boolean;
  enable_push: boolean;
  attendance_retention_days: number;
  updated_at: string;
}

export interface MemberRow {
  id: string;
  gym_id: string;
  member_code: string;
  full_name: string;
  email: string | null;
  phone: string;
  photo_url: string | null;
  date_of_birth: string | null;
  gender: Gender | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  join_date: string;
  qr_token: string;
  qr_status: "active" | "revoked";
  qr_rotated_at: string | null;
  status: MemberStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanRow {
  id: string;
  gym_id: string;
  name: string;
  description: string | null;
  price: number | string;
  duration_value: number;
  duration_unit: DurationUnit;
  benefits: string[] | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  id: string;
  gym_id: string;
  member_id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  status: StoredMembershipStatus;
  price: number | string;
  discount: number | string;
  source: "new" | "renewal" | "extension" | "correction";
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  plan?: Pick<PlanRow, "name" | "duration_value" | "duration_unit"> | null;
}

export interface AttendanceRow {
  id: string;
  gym_id: string;
  member_id: string;
  membership_id: string | null;
  check_in: string;
  check_out: string | null;
  status: AttendanceStatus;
  method: AttendanceMethod;
  scanner_id: string | null;
  notes: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  member?: { full_name: string; member_code: string; photo_url: string | null } | null;
  scanner?: { full_name: string } | null;
}

export interface PaymentRow {
  id: string;
  gym_id: string;
  member_id: string;
  membership_id: string | null;
  amount: number | string;
  payment_date: string;
  method: PaymentMethod;
  status: PaymentStatus;
  transaction_ref: string | null;
  notes: string | null;
  receipt_no: string;
  recorded_by: string | null;
  refund_of: string | null;
  created_at: string;
  updated_at: string;
  member?: { full_name: string; member_code: string } | null;
  membership?: (MembershipRow & { plan?: Pick<PlanRow, "name"> | null }) | null;
}

export interface StaffRow {
  id: string;
  gym_id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  specialization: string | null;
  employment_status: EmploymentStatus;
  joining_date: string;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClassRow {
  id: string;
  gym_id: string;
  name: string;
  description: string | null;
  trainer_id: string | null;
  starts_at: string;
  duration_minutes: number;
  capacity: number;
  status: ClassStatus;
  created_at: string;
  updated_at: string;
  trainer?: { full_name: string } | null;
  enrollments?: Array<{ id: string }> | null;
}

export interface EnrollmentRow {
  id: string;
  gym_id: string;
  class_id: string;
  member_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  created_at: string;
  updated_at: string;
  member?: { full_name: string; member_code: string; photo_url: string | null } | null;
}

export interface NotificationRow {
  id: string;
  gym_id: string;
  user_id: string | null;
  member_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  severity: Severity;
  is_read: boolean;
  dedupe_key: string | null;
  link: string | null;
  created_at: string;
}

export interface AuditRow {
  id: string;
  gym_id: string;
  actor_id: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  actor?: { full_name: string } | null;
}

export function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapGym(row: GymRow): Gym {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone,
    currency: row.currency,
    logoUrl: row.logo_url,
    address: row.address,
    phone: row.phone,
    email: row.email,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    gymId: row.gym_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    avatarUrl: row.avatar_url,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSettings(row: GymSettingsRow): GymSettings {
  return {
    gymId: row.gym_id,
    checkinCooldownMinutes: row.checkin_cooldown_minutes,
    trackCheckout: row.track_checkout,
    expiringSoonDays: row.expiring_soon_days,
    expiryReminderDays: row.expiry_reminder_days ?? [],
    allowExpiredCheckin: row.allow_expired_checkin,
    enableEmail: row.enable_email,
    enableSms: row.enable_sms,
    enableWhatsapp: row.enable_whatsapp,
    enablePush: row.enable_push,
    attendanceRetentionDays: row.attendance_retention_days,
    updatedAt: row.updated_at,
  };
}

export function mapMember(row: MemberRow): Member {
  return {
    id: row.id,
    gymId: row.gym_id,
    memberCode: row.member_code,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    photoUrl: row.photo_url,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    address: row.address,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    joinDate: row.join_date,
    qrToken: row.qr_token,
    qrStatus: row.qr_status,
    qrRotatedAt: row.qr_rotated_at,
    status: row.status,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPlan(row: PlanRow): MembershipPlan {
  return {
    id: row.id,
    gymId: row.gym_id,
    name: row.name,
    description: row.description,
    price: num(row.price),
    durationValue: row.duration_value,
    durationUnit: row.duration_unit,
    benefits: row.benefits ?? [],
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMembership(row: MembershipRow): MemberMembership {
  return {
    id: row.id,
    gymId: row.gym_id,
    memberId: row.member_id,
    planId: row.plan_id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    price: num(row.price),
    discount: num(row.discount),
    source: row.source,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    planName: row.plan?.name ?? null,
    planDurationValue: row.plan?.duration_value ?? null,
    planDurationUnit: row.plan?.duration_unit ?? null,
  };
}

export function mapAttendance(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    gymId: row.gym_id,
    memberId: row.member_id,
    membershipId: row.membership_id,
    checkIn: row.check_in,
    checkOut: row.check_out,
    status: row.status,
    method: row.method,
    scannerId: row.scanner_id,
    notes: row.notes,
    meta: row.meta ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    memberName: row.member?.full_name,
    memberCode: row.member?.member_code,
    memberPhoto: row.member?.photo_url ?? null,
    scannerName: row.scanner?.full_name ?? null,
  };
}

export function mapPayment(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    gymId: row.gym_id,
    memberId: row.member_id,
    membershipId: row.membership_id,
    amount: num(row.amount),
    paymentDate: row.payment_date,
    method: row.method,
    status: row.status,
    transactionRef: row.transaction_ref,
    notes: row.notes,
    receiptNo: row.receipt_no,
    recordedBy: row.recorded_by,
    refundOf: row.refund_of,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    memberName: row.member?.full_name,
    memberCode: row.member?.member_code,
    membershipSummary: row.membership?.plan?.name
      ? `${row.membership.plan.name} (${row.membership.start_date} → ${row.membership.end_date})`
      : null,
  };
}

export function mapStaff(row: StaffRow): StaffProfile {
  return {
    id: row.id,
    gymId: row.gym_id,
    profileId: row.profile_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    specialization: row.specialization,
    employmentStatus: row.employment_status,
    joiningDate: row.joining_date,
    photoUrl: row.photo_url,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapClass(row: ClassRow, enrolledCount?: number): GymClass {
  return {
    id: row.id,
    gymId: row.gym_id,
    name: row.name,
    description: row.description,
    trainerId: row.trainer_id,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    capacity: row.capacity,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trainerName: row.trainer?.full_name ?? null,
    enrolledCount: enrolledCount ?? row.enrollments?.filter((e) => e.id).length ?? 0,
  };
}

export function mapEnrollment(row: EnrollmentRow): ClassEnrollment {
  return {
    id: row.id,
    gymId: row.gym_id,
    classId: row.class_id,
    memberId: row.member_id,
    status: row.status,
    enrolledAt: row.enrolled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    memberName: row.member?.full_name,
    memberCode: row.member?.member_code,
    memberPhoto: row.member?.photo_url ?? null,
  };
}

export function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    gymId: row.gym_id,
    userId: row.user_id,
    memberId: row.member_id,
    type: row.type,
    title: row.title,
    body: row.body,
    severity: row.severity,
    isRead: row.is_read,
    dedupeKey: row.dedupe_key,
    link: row.link,
    createdAt: row.created_at,
  };
}

export function mapAudit(row: AuditRow): AuditLog {
  return {
    id: row.id,
    gymId: row.gym_id,
    actorId: row.actor_id,
    entity: row.entity,
    entityId: row.entity_id,
    action: row.action,
    oldValues: row.old_values,
    newValues: row.new_values,
    createdAt: row.created_at,
    actorName: row.actor?.full_name ?? null,
  };
}
