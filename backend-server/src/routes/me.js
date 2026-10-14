import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import User from "../models/User.js";
import Member from "../models/Member.js";
import MemberMembership from "../models/MemberMembership.js";
import MembershipPlan from "../models/MembershipPlan.js";
import AttendanceRecord from "../models/AttendanceRecord.js";
import PaymentRecord from "../models/PaymentRecord.js";
import ClassEnrollment from "../models/ClassEnrollment.js";
import GymClass from "../models/GymClass.js";
import StaffProfile from "../models/StaffProfile.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, forbidden, notFound } from "../lib/errors.js";
import { parseBody } from "../middleware/validate.js";
import {
  toPublicUser,
  toMemberWithMembership,
  toAttendance,
  toPayment,
  toClass,
  toEnrollment,
} from "../lib/serialize.js";
import { currentMembership, membershipBalance } from "../lib/membership.js";
import { loadGymContext } from "../services/context.js";
import { writeAudit } from "../lib/audit.js";

/**
 * Member self-service portal — every route is scoped to the caller's own
 * member record. Staff tokens get 403 here; member tokens get 403 everywhere
 * else (see the block in src/index.js).
 */
const router = Router();

router.use(requireAuth);
router.use((req, _res, next) => {
  if (req.user.role !== "member") {
    return next(forbidden("This endpoint is for member accounts", "member_only"));
  }
  if (!req.user.memberId) return next(notFound("No member profile is linked to this login"));
  next();
});

/** The caller's own member document (tenancy-checked). */
async function loadSelf(req) {
  const member = await Member.findOne({ _id: req.user.memberId, gymId: req.user.gymId }).lean();
  if (!member) throw notFound("Member profile not found");
  return member;
}

/** Their governing membership (started, prefer active, most recent end). */
async function loadSelfMembership(memberId, today) {
  const memberships = await MemberMembership.find({ memberId, startDate: { $lte: today } }).lean();
  memberships.sort(
    (a, b) =>
      (b.status === "active" ? 1 : 0) - (a.status === "active" ? 1 : 0) ||
      new Date(b.endDate) - new Date(a.endDate),
  );
  return memberships[0] ?? null;
}

/**
 * GET /api/me → { user, member, gym }
 * `member` carries the portal profile: identity + membership + derived status.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    const member = await loadSelf(req);
    const today = new Date();
    const membership = await loadSelfMembership(member._id, today);
    const plan = membership ? await MembershipPlan.findById(membership.planId).lean() : null;
    const user = await User.findById(req.user.id).lean();

    // Billing snapshot for the portal — same formula as staff dues (getDuesRows).
    let billing = null;
    if (membership) {
      const payments = await PaymentRecord.find({
        gymId: req.user.gymId,
        membershipId: membership._id,
        status: { $in: ["paid", "partial"] },
      }).select("amount status").lean();
      const paid = Math.round(payments.reduce((sum, p) => sum + (p.amount ?? 0), 0) * 100) / 100;
      billing = {
        billed: Math.max(0, (membership.price ?? 0) - (membership.discount ?? 0)),
        paid,
        balance: membershipBalance(membership.price, membership.discount, payments),
      };
    }

    const memberJson = toMemberWithMembership(member, membership, plan, {
      now: ctx.now,
      tz: ctx.tz,
      expiringSoonDays: ctx.expiringSoonDays,
    });
    if (memberJson?.membership && billing) Object.assign(memberJson.membership, billing);

    res.json({
      user: toPublicUser(user),
      member: memberJson,
      gym: { name: ctx.gym.name, timezone: ctx.tz },
    });
  }),
);

/** GET /api/me/qr → { token, status } — the member's own check-in QR. */
router.get(
  "/qr",
  asyncHandler(async (req, res) => {
    const member = await loadSelf(req);
    res.json({ token: member.qrToken, status: member.qrStatus });
  }),
);

/** GET /api/me/attendance?limit=30 → own visits, newest first. */
router.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    const member = await loadSelf(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    const rows = await AttendanceRecord.find({ gymId: req.user.gymId, memberId: member._id })
      .sort({ checkIn: -1 })
      .limit(limit)
      .lean();
    res.json(rows.map((row) => toAttendance(row, member, null)));
  }),
);

/** GET /api/me/payments → own payment history, newest first. */
router.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const member = await loadSelf(req);
    const rows = await PaymentRecord.find({ gymId: req.user.gymId, memberId: member._id })
      .sort({ paymentDate: -1, createdAt: -1 })
      .limit(200)
      .lean();

    // Join membership/plan for the payment summary line.
    const memberships = await MemberMembership.find({ memberId: member._id }).lean();
    const byId = new Map(memberships.map((m) => [String(m._id), m]));
    const planIds = [...new Set(memberships.map((m) => String(m.planId)))];
    const plans = await MembershipPlan.find({ _id: { $in: planIds } }).lean();
    const planById = new Map(plans.map((p) => [String(p._id), p]));

    res.json(
      rows.map((row) => {
        const membership = row.membershipId ? byId.get(String(row.membershipId)) : null;
        const plan = membership ? planById.get(String(membership.planId)) : null;
        return toPayment(row, member, membership, plan);
      }),
    );
  }),
);

/** GET /api/me/classes → own enrollments joined with the class schedule. */
router.get(
  "/classes",
  asyncHandler(async (req, res) => {
    const member = await loadSelf(req);
    const enrollments = await ClassEnrollment.find({
      gymId: req.user.gymId,
      memberId: member._id,
      status: { $ne: "cancelled" },
    }).lean();

    const classes = await GymClass.find({ _id: { $in: enrollments.map((e) => e.classId) } }).lean();
    const classById = new Map(classes.map((c) => [String(c._id), c]));
    const trainerIds = [...new Set(classes.map((c) => c.trainerId).filter(Boolean).map(String))];
    const trainers = trainerIds.length
      ? await StaffProfile.find({ _id: { $in: trainerIds } }).lean()
      : [];
    const trainerById = new Map(trainers.map((t) => [String(t._id), t]));

    res.json(
      enrollments
        .map((enrollment) => {
          const cls = classById.get(String(enrollment.classId));
          if (!cls) return null;
          return {
            enrollment: toEnrollment(enrollment, member),
            class: toClass(
              cls,
              cls.trainerId ? trainerById.get(String(cls.trainerId)) : null,
              null,
            ),
          };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(a.class.startsAt) - new Date(b.class.startsAt)),
    );
  }),
);

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

/** POST /api/me/password { currentPassword, newPassword } → 204 */
router.post(
  "/password",
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = parseBody(passwordSchema, req.body);
    const user = await User.findById(req.user.id);
    if (!user) throw notFound("Account not found");

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw forbidden("Current password is incorrect", "wrong_password");

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    await writeAudit({
      gymId: req.user.gymId,
      actorId: req.user.id,
      entity: "users",
      entityId: String(user._id),
      action: "update",
      newValues: { passwordChanged: true },
    });
    res.status(204).end();
  }),
);

export default router;
