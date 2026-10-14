/**
 * Pulse Gym Suite — MongoDB seed data (demo gym).
 *
 * Port of supabase/seed.sql. SAFE & IDEMPOTENT for demo data: every run
 * replaces only the demo gym's own rows (identifiable by the deterministic
 * ids below / slug `pulse-demo-gym` / `DEMO-*` member codes), then re-inserts
 * the full demo dataset relative to today's date.
 *
 * Accounts created (password `test@123`):
 *   admin@gmail.com   (owner)
 *   member1@gmail.com (front_desk)
 *   member2@gmail.com (front_desk)
 */

import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { connectDb, disconnectDb } from "../src/db.js";

const oid = (hex) => new Types.ObjectId(hex);

/* Deterministic ids (derived from the Supabase seed UUIDs). */
const GYM = oid("d3a7e0010000400080000001");
const PLAN_MONTHLY = oid("d3a7e0010000400080000011");
const PLAN_QUARTERLY = oid("d3a7e0010000400080000012");
const PLAN_HALF_YEARLY = oid("d3a7e0010000400080000013");
const PLAN_ANNUAL = oid("d3a7e0010000400080000014");
const MEMBER = (n) => oid(`d3a7e00100004000800000${n.toString(16).toUpperCase().padStart(2, "0")}`);
const MEMBERSHIP = (n) => oid(`d3a7e00100004000800000${n.toString(16).toUpperCase().padStart(2, "0")}`);
const ATTENDANCE = (n) => oid(`d3a7e00100004000800000${n.toString(16).toUpperCase().padStart(2, "0")}`);
const PAYMENT = (n) => oid(`d3a7e00100004000800000${n.toString(16).toUpperCase().padStart(2, "0")}`);
const STAFF = (n) => oid(`d3a7e00100004000800000${n.toString(16).toUpperCase().padStart(2, "0")}`);
const Klass = (n) => oid(`d3a7e00100004000800000${n.toString(16).toUpperCase().padStart(2, "0")}`);
const ENROLLMENT = (n) => oid(`d3a7e00100004000800000${n.toString(16).toUpperCase().padStart(2, "0")}`);
const NOTIFICATION = (n) => oid(`d3a7e00100004000800000${n.toString(16).toUpperCase().padStart(2, "0")}`);

/* Date helpers: offsets relative to today (UTC, mirroring the SQL seed). */
const now = new Date();
const day0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const day = (offset) => new Date(day0 + offset * 86_400_000);
const at = (offset, hours, minutes = 0) =>
  new Date(day0 + offset * 86_400_000 + hours * 3_600_000 + minutes * 60_000);
const ymd = (date) => date.toISOString().slice(0, 10);

async function main() {
  await connectDb();

  // Import models after the DB connection so mongoose is ready.
  const { default: Gym } = await import("../src/models/Gym.js");
  const { default: GymSettings } = await import("../src/models/GymSettings.js");
  const { default: User } = await import("../src/models/User.js");
  const { default: Member } = await import("../src/models/Member.js");
  const { default: MembershipPlan } = await import("../src/models/MembershipPlan.js");
  const { default: MemberMembership } = await import("../src/models/MemberMembership.js");
  const { default: AttendanceRecord } = await import("../src/models/AttendanceRecord.js");
  const { default: PaymentRecord } = await import("../src/models/PaymentRecord.js");
  const { default: StaffProfile } = await import("../src/models/StaffProfile.js");
  const { default: GymClass } = await import("../src/models/GymClass.js");
  const { default: ClassEnrollment } = await import("../src/models/ClassEnrollment.js");
  const { default: AppNotification } = await import("../src/models/AppNotification.js");
  const { default: AuditLog } = await import("../src/models/AuditLog.js");
  const { default: Counter } = await import("../src/models/Counter.js");

  console.log("Clearing previous demo data (only the demo gym)…");
  await Promise.all([
    PaymentRecord.deleteMany({ gymId: GYM }),
    AttendanceRecord.deleteMany({ gymId: GYM }),
    ClassEnrollment.deleteMany({ gymId: GYM }),
    AppNotification.deleteMany({ gymId: GYM }),
    GymClass.deleteMany({ gymId: GYM }),
    MemberMembership.deleteMany({ gymId: GYM }),
    Member.deleteMany({ gymId: GYM }),
    MembershipPlan.deleteMany({ gymId: GYM }),
    StaffProfile.deleteMany({ gymId: GYM }),
    AuditLog.deleteMany({ gymId: GYM }),
    GymSettings.deleteMany({ gymId: GYM }),
    User.deleteMany({ gymId: GYM }),
    Counter.deleteMany({ key: { $in: [`member_code:${GYM}`, `receipt_no:${GYM}`] } }),
    Gym.deleteMany({ _id: GYM }),
  ]);

  console.log("Inserting demo gym + settings…");
  await Gym.create([
    {
      _id: GYM,
      name: "Pulse Fitness Studio — Demo",
      slug: "pulse-demo-gym",
      timezone: "Asia/Kolkata",
      currency: "INR",
      logoUrl: null,
      address: "42, Wellness Road, Bengaluru, KA 560001",
      phone: "+918040000001",
      email: "demo@pulsegymsuite.example",
      isActive: true,
    },
  ]);
  await GymSettings.create([
    {
      gymId: GYM,
      checkinCooldownMinutes: 60,
      trackCheckout: true,
      expiringSoonDays: 7,
      expiryReminderDays: [7, 3, 1],
      allowExpiredCheckin: false,
    },
  ]);

  console.log("Inserting membership plans…");
  await MembershipPlan.create([
    {
      _id: PLAN_MONTHLY,
      gymId: GYM,
      name: "Monthly",
      description: "Full gym access for 1 month. [DEMO SEED]",
      price: 1500,
      durationValue: 1,
      durationUnit: "month",
      benefits: ["Gym floor access", "Locker"],
      isActive: true,
      sortOrder: 1,
    },
    {
      _id: PLAN_QUARTERLY,
      gymId: GYM,
      name: "Quarterly",
      description: "Full gym access for 3 months. [DEMO SEED]",
      price: 4000,
      durationValue: 3,
      durationUnit: "month",
      benefits: ["Gym floor access", "Locker", "1 body composition scan"],
      isActive: true,
      sortOrder: 2,
    },
    {
      _id: PLAN_HALF_YEARLY,
      gymId: GYM,
      name: "Half-Yearly",
      description: "Full gym access for 6 months. [DEMO SEED]",
      price: 7000,
      durationValue: 6,
      durationUnit: "month",
      benefits: ["Gym floor access", "Locker", "2 body composition scans", "Group classes"],
      isActive: true,
      sortOrder: 3,
    },
    {
      _id: PLAN_ANNUAL,
      gymId: GYM,
      name: "Annual",
      description: "Full gym access for 12 months. [DEMO SEED]",
      price: 12000,
      durationValue: 12,
      durationUnit: "month",
      benefits: ["Gym floor access", "Locker", "All group classes", "Guest passes x4"],
      isActive: true,
      sortOrder: 4,
    },
  ]);

  console.log("Inserting 12 demo members…");
  const memberSeed = [
    // [n, code, name, email, phone, gender, joinOffset, note]
    [0x21, "DEMO-9001", "Aarav Sharma", "demo01@example.com", "+919810000001", "male", -40, "[DEMO SEED] Regular evening member."],
    [0x22, "DEMO-9002", "Diya Patel", "demo02@example.com", "+919810000002", "female", -30, "[DEMO SEED] Membership expires within 7 days."],
    [0x23, "DEMO-9003", "Rohan Verma", "demo03@example.com", "+919810000003", "male", -100, "[DEMO SEED] Membership expired — renewal pending."],
    [0x24, "DEMO-9004", "Ananya Iyer", "demo04@example.com", "+919810000004", "female", -30, "[DEMO SEED] Membership suspended for non-payment."],
    [0x25, "DEMO-9005", "Kabir Singh", "demo05@example.com", "+919810000005", "male", -40, "[DEMO SEED] Bought at a discounted price."],
    [0x26, "DEMO-9006", "Meera Nair", "demo06@example.com", "+919810000006", "female", -100, "[DEMO SEED] Annual member."],
    [0x27, "DEMO-9007", "Aditya Rao", "demo07@example.com", "+919810000007", "male", -27, "[DEMO SEED] Expiring very soon (3 days)."],
    [0x28, "DEMO-9008", "Ishita Bose", "demo08@example.com", "+919810000008", "female", -20, "[DEMO SEED] Partial payment pending."],
    [0x29, "DEMO-9009", "Vihaan Gupta", "demo09@example.com", "+919810000009", "male", -50, "[DEMO SEED] Cancelled annual membership."],
    [0x2a, "DEMO-9010", "Sara Khan", "demo10@example.com", "+919810000010", "female", -120, "[DEMO SEED] Long-expired quarterly member."],
    [0x2b, "DEMO-9011", "Arjun Mehta", "demo11@example.com", "+919810000011", "male", -5, "[DEMO SEED] Fresh renewal, payment still pending."],
    [0x2c, "DEMO-9012", "Nisha Reddy", "demo12@example.com", "+919810000012", "female", -28, "[DEMO SEED] Expiring in 2 days, small discount applied."],
  ];
  await Member.create(
    memberSeed.map(([n, code, fullName, email, phone, gender, joinOffset, notes]) => ({
      _id: MEMBER(n),
      gymId: GYM,
      memberCode: code,
      fullName,
      email,
      phone,
      photoUrl: null,
      dateOfBirth: null,
      gender,
      address: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      joinDate: day(joinOffset),
      qrToken: `demo_qr_token_${code.slice(-2)}`,
      qrStatus: "active",
      qrRotatedAt: null,
      status: "active",
      notes,
    })),
  );

  console.log("Inserting memberships (mixed states)…");
  // [n, memberN, planId, startOffset, endOffset, status, price, discount, source, notes]
  const membershipSeed = [
    [0x41, 0x21, PLAN_MONTHLY, -10, 20, "active", 1500, 0, "new", "[DEMO SEED]"],
    [0x42, 0x22, PLAN_MONTHLY, -25, 5, "active", 1500, 0, "new", "[DEMO SEED] Expiring within 7 days."],
    [0x43, 0x23, PLAN_QUARTERLY, -100, -10, "active", 4000, 0, "new", "[DEMO SEED] Expired 10 days ago."],
    [0x44, 0x24, PLAN_HALF_YEARLY, -30, 150, "suspended", 7000, 0, "new", "[DEMO SEED] Suspended for non-payment."],
    [0x45, 0x25, PLAN_QUARTERLY, -40, 50, "active", 4000, 500, "new", "[DEMO SEED] Festive discount ₹500."],
    [0x46, 0x26, PLAN_ANNUAL, -100, 265, "active", 12000, 0, "new", "[DEMO SEED]"],
    [0x47, 0x27, PLAN_MONTHLY, -27, 3, "active", 1500, 0, "new", "[DEMO SEED] Expiring in 3 days."],
    [0x48, 0x28, PLAN_HALF_YEARLY, -20, 160, "active", 7000, 0, "new", "[DEMO SEED]"],
    [0x49, 0x29, PLAN_ANNUAL, -50, 315, "cancelled", 12000, 0, "new", "[DEMO SEED] Cancelled by member."],
    [0x4a, 0x2a, PLAN_QUARTERLY, -120, -30, "active", 4000, 0, "new", "[DEMO SEED] Expired 30 days ago."],
    [0x4b, 0x2b, PLAN_QUARTERLY, -5, 85, "active", 4000, 0, "renewal", "[DEMO SEED] Pending payment case."],
    [0x4c, 0x2c, PLAN_MONTHLY, -28, 2, "active", 1500, 100, "renewal", "[DEMO SEED] Expiring in 2 days."],
  ];
  await MemberMembership.create(
    membershipSeed.map(([n, memberN, planId, startOffset, endOffset, status, price, discount, source, notes]) => ({
      _id: MEMBERSHIP(n),
      gymId: GYM,
      memberId: MEMBER(memberN),
      planId,
      startDate: day(startOffset),
      endDate: day(endOffset),
      status,
      price,
      discount,
      source,
      notes,
      createdBy: null,
    })),
  );

  console.log("Inserting attendance (last 14 days)…");
  // [n, memberN, membershipN, dayOffset, inH, inM, outH, outM, status, method]
  const attendanceSeed = [
    [0x51, 0x21, 0x41, -10, 18, 30, 20, 0, "checked_out", "qr"],
    [0x52, 0x21, 0x41, -3, 6, 30, 7, 45, "checked_out", "qr"],
    [0x53, 0x21, 0x41, 0, 6, 30, null, null, "checked_in", "qr"],
    [0x54, 0x22, 0x42, -7, 19, 0, 20, 0, "checked_out", "qr"],
    [0x55, 0x22, 0x42, -2, 19, 0, 20, 0, "checked_out", "qr"],
    [0x56, 0x25, 0x45, -6, 7, 15, 8, 0, "checked_out", "manual"],
    [0x57, 0x25, 0x45, -1, 7, 15, 8, 0, "checked_out", "qr"],
    [0x58, 0x26, 0x46, -9, 20, 0, 21, 10, "checked_out", "qr"],
    [0x59, 0x26, 0x46, -4, 20, 0, 21, 10, "checked_out", "qr"],
    [0x5a, 0x27, 0x47, -5, 18, 0, 19, 0, "checked_out", "qr"],
    [0x5b, 0x27, 0x47, -1, 18, 0, 19, 0, "checked_out", "qr"],
    [0x5c, 0x28, 0x48, -8, 17, 30, 18, 30, "checked_out", "qr"],
    [0x5d, 0x2b, 0x4b, -4, 8, 0, 8, 50, "checked_out", "qr"],
    [0x5e, 0x2c, 0x4c, -2, 19, 30, 20, 30, "checked_out", "qr"],
  ];
  await AttendanceRecord.create(
    attendanceSeed.map(([n, memberN, membershipN, dayOffset, inH, inM, outH, outM, status, method]) => ({
      _id: ATTENDANCE(n),
      gymId: GYM,
      memberId: MEMBER(memberN),
      membershipId: MEMBERSHIP(membershipN),
      checkIn: at(dayOffset, inH, inM),
      checkOut: outH === null ? null : at(dayOffset, outH, outM),
      status,
      method,
      scannerId: null,
      notes: "[DEMO SEED]",
      meta: {},
    })),
  );

  console.log("Inserting payments…");
  // [n, memberN, membershipN, amount, dayOffset, method, status, ref, notes, receipt]
  const paymentSeed = [
    [0x61, 0x21, 0x41, 1500, -10, "cash", "paid", "UPI-DEMO-6001", "[DEMO SEED]", "DEMO-R0001"],
    [0x62, 0x22, 0x42, 1500, -25, "upi", "paid", "UPI-DEMO-6002", "[DEMO SEED]", "DEMO-R0002"],
    [0x63, 0x23, 0x43, 4000, -100, "card", "paid", "CARD-DEMO-6003", "[DEMO SEED]", "DEMO-R0003"],
    [0x64, 0x24, 0x44, 7000, -30, "bank_transfer", "paid", "NEFT-DEMO-6004", "[DEMO SEED] Payment later reversed → membership suspended.", "DEMO-R0004"],
    [0x65, 0x25, 0x45, 3500, -40, "upi", "paid", "UPI-DEMO-6005", "[DEMO SEED] ₹500 discount applied.", "DEMO-R0005"],
    [0x66, 0x26, 0x46, 12000, -100, "bank_transfer", "paid", "NEFT-DEMO-6006", "[DEMO SEED]", "DEMO-R0006"],
    [0x67, 0x27, 0x47, 1500, -27, "cash", "paid", null, "[DEMO SEED]", "DEMO-R0007"],
    [0x68, 0x28, 0x48, 3000, -20, "upi", "partial", "UPI-DEMO-6008", "[DEMO SEED] ₹4,000 of ₹7,000 still due.", "DEMO-R0008"],
    [0x69, 0x29, 0x49, 12000, -50, "card", "paid", "CARD-DEMO-6009", "[DEMO SEED] Refund handled offline.", "DEMO-R0009"],
    [0x6a, 0x2a, 0x4a, 4000, -120, "cash", "paid", null, "[DEMO SEED]", "DEMO-R0010"],
    [0x6b, 0x2b, 0x4b, 4000, -5, "upi", "pending", null, "[DEMO SEED] Renewal taken, payment promised.", "DEMO-R0011"],
    [0x6c, 0x2c, 0x4c, 1400, -28, "upi", "paid", "UPI-DEMO-6012", "[DEMO SEED] ₹100 discount applied.", "DEMO-R0012"],
  ];
  await PaymentRecord.create(
    paymentSeed.map(([n, memberN, membershipN, amount, dayOffset, method, status, ref, notes, receiptNo]) => ({
      _id: PAYMENT(n),
      gymId: GYM,
      memberId: MEMBER(memberN),
      membershipId: MEMBERSHIP(membershipN),
      amount,
      paymentDate: day(dayOffset),
      method,
      status,
      transactionRef: ref,
      notes,
      receiptNo,
      recordedBy: null,
      refundOf: null,
      idempotencyKey: null,
    })),
  );

  console.log("Inserting staff…");
  await StaffProfile.create([
    {
      _id: STAFF(0x71), gymId: GYM, profileId: null, fullName: "Ananya Rao",
      email: "ananya.trainer@example.com", phone: "+919820000001", role: "trainer",
      specialization: "Yoga & mobility", employmentStatus: "active",
      joiningDate: day(-200), notes: "[DEMO SEED]",
    },
    {
      _id: STAFF(0x72), gymId: GYM, profileId: null, fullName: "Vikram Singh",
      email: "vikram.trainer@example.com", phone: "+919820000002", role: "trainer",
      specialization: "Strength & conditioning", employmentStatus: "active",
      joiningDate: day(-150), notes: "[DEMO SEED]",
    },
    {
      _id: STAFF(0x73), gymId: GYM, profileId: null, fullName: "Meera Iyer",
      email: "meera.trainer@example.com", phone: "+919820000003", role: "trainer",
      specialization: "Cardio & HIIT", employmentStatus: "on_leave",
      joiningDate: day(-90), notes: "[DEMO SEED]",
    },
  ]);

  console.log("Inserting classes + enrollments…");
  await GymClass.create([
    {
      _id: Klass(0x81), gymId: GYM, name: "Sunset Yoga Flow",
      description: "Relaxing vinyasa flow to end the day. [DEMO SEED]",
      trainerId: STAFF(0x71), startsAt: at(2, 17, 30), durationMinutes: 60, capacity: 20, status: "scheduled",
    },
    {
      _id: Klass(0x82), gymId: GYM, name: "Strength Bootcamp",
      description: "Full-body barbell circuit. [DEMO SEED]",
      trainerId: STAFF(0x72), startsAt: at(3, 7, 0), durationMinutes: 45, capacity: 15, status: "scheduled",
    },
    {
      _id: Klass(0x83), gymId: GYM, name: "HIIT Blast",
      description: "High-intensity intervals, all levels. [DEMO SEED]",
      trainerId: STAFF(0x73), startsAt: at(5, 19, 0), durationMinutes: 45, capacity: 25, status: "scheduled",
    },
  ]);
  const enrolledAt = (hoursAgo) => new Date(now.getTime() - hoursAgo * 3_600_000);
  await ClassEnrollment.create([
    { _id: ENROLLMENT(0x91), gymId: GYM, classId: Klass(0x81), memberId: MEMBER(0x21), status: "enrolled", enrolledAt: enrolledAt(48) },
    { _id: ENROLLMENT(0x92), gymId: GYM, classId: Klass(0x81), memberId: MEMBER(0x22), status: "enrolled", enrolledAt: enrolledAt(24) },
    { _id: ENROLLMENT(0x93), gymId: GYM, classId: Klass(0x81), memberId: MEMBER(0x25), status: "enrolled", enrolledAt: enrolledAt(24) },
    { _id: ENROLLMENT(0x94), gymId: GYM, classId: Klass(0x82), memberId: MEMBER(0x23), status: "enrolled", enrolledAt: enrolledAt(3) },
    { _id: ENROLLMENT(0x95), gymId: GYM, classId: Klass(0x82), memberId: MEMBER(0x24), status: "cancelled", enrolledAt: enrolledAt(5) },
    { _id: ENROLLMENT(0x96), gymId: GYM, classId: Klass(0x82), memberId: MEMBER(0x26), status: "enrolled", enrolledAt: enrolledAt(6) },
    { _id: ENROLLMENT(0x97), gymId: GYM, classId: Klass(0x83), memberId: MEMBER(0x27), status: "enrolled", enrolledAt: enrolledAt(12) },
    { _id: ENROLLMENT(0x98), gymId: GYM, classId: Klass(0x83), memberId: MEMBER(0x28), status: "enrolled", enrolledAt: enrolledAt(12) },
  ]);

  console.log("Inserting notifications…");
  await AppNotification.create([
    {
      _id: NOTIFICATION(0xa1), gymId: GYM, userId: null, memberId: MEMBER(0x22),
      type: "expiry_warning", title: "Membership expiring soon",
      body: "Diya Patel (DEMO-9002) — membership ends within a week.",
      severity: "warning", isRead: false,
      dedupeKey: `${MEMBER(0x22)}:${MEMBERSHIP(0x42)}:expiry_warning`,
      link: `/members/${MEMBER(0x22)}`,
    },
    {
      _id: NOTIFICATION(0xa2), gymId: GYM, userId: null, memberId: MEMBER(0x27),
      type: "expiry_warning", title: "Membership expiring soon",
      body: "Aditya Rao (DEMO-9007) — membership ends in 3 days.",
      severity: "warning", isRead: false,
      dedupeKey: `${MEMBER(0x27)}:${MEMBERSHIP(0x47)}:expiry_warning`,
      link: `/members/${MEMBER(0x27)}`,
    },
    {
      _id: NOTIFICATION(0xa3), gymId: GYM, userId: null, memberId: null,
      type: "general", title: "Welcome to Pulse Gym Suite",
      body: "This is demo data — run `npm run seed` to refresh it.",
      severity: "info", isRead: false,
      dedupeKey: "demo-seed:welcome",
      link: "/settings",
    },
  ]);

  console.log("Inserting login accounts…");
  const passwordHash = await bcrypt.hash("test@123", 10);
  await User.create([
    { gymId: GYM, fullName: "Gym Owner", email: "admin@gmail.com", phone: "+918040000001", passwordHash, role: "owner", isActive: true },
    { gymId: GYM, fullName: "Front Desk One", email: "member1@gmail.com", phone: "+918040000002", passwordHash, role: "front_desk", isActive: true },
    { gymId: GYM, fullName: "Front Desk Two", email: "member2@gmail.com", phone: "+918040000003", passwordHash, role: "front_desk", isActive: true },
  ]);

  const counts = {
    gym: await Gym.countDocuments({ _id: GYM }),
    settings: await GymSettings.countDocuments({ gymId: GYM }),
    plans: await MembershipPlan.countDocuments({ gymId: GYM }),
    members: await Member.countDocuments({ gymId: GYM }),
    memberships: await MemberMembership.countDocuments({ gymId: GYM }),
    attendance: await AttendanceRecord.countDocuments({ gymId: GYM }),
    payments: await PaymentRecord.countDocuments({ gymId: GYM }),
    staff: await StaffProfile.countDocuments({ gymId: GYM }),
    classes: await GymClass.countDocuments({ gymId: GYM }),
    enrollments: await ClassEnrollment.countDocuments({ gymId: GYM }),
    notifications: await AppNotification.countDocuments({ gymId: GYM }),
    users: await User.countDocuments({ gymId: GYM }),
  };

  console.log("\nSeed complete. Demo data inserted:");
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key.padEnd(14)} ${value}`);
  }
  console.log("\nLogin accounts (password: test@123):");
  console.log("  admin@gmail.com   owner");
  console.log("  member1@gmail.com front_desk");
  console.log("  member2@gmail.com front_desk");
  console.log(`\nDemo QR tokens: demo_qr_token_01 … demo_qr_token_12 (member codes DEMO-9001 … DEMO-9012)`);
  console.log(`Today (${ymd(now)} UTC) — memberships are relative to today.`);

  await disconnectDb();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exitCode = 1;
  return disconnectDb().catch(() => {});
});
