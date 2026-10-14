import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import Member from "../models/Member.js";
import MemberMembership from "../models/MemberMembership.js";
import MembershipPlan from "../models/MembershipPlan.js";
import AttendanceRecord from "../models/AttendanceRecord.js";
import PaymentRecord from "../models/PaymentRecord.js";
import ClassEnrollment from "../models/ClassEnrollment.js";
import { withTransaction } from "../db.js";
import { requireAuth, requireCap } from "../middleware/auth.js";
import { asyncHandler, badRequest, notFound, conflict } from "../lib/errors.js";
import { parseBody, intParam } from "../middleware/validate.js";
import { toMember, toMembership, toAttendance, toPayment, ymd } from "../lib/serialize.js";
import { generateQrToken } from "../lib/qr.js";
import { nextMemberCode } from "../lib/codes.js";
import { writeAudit, pick } from "../lib/audit.js";
import { planEndDate, renewalStartDate, currentMembership } from "../lib/membership.js";
import { parseDateOnly, ymdInTz } from "../lib/dates.js";
import { loadGymContext } from "../services/context.js";
import { decorateAllMembers, decorateMember } from "../services/members.js";
import { createPaymentRow } from "../services/payments.js";
import { ensureMemberLogin } from "../lib/memberLogins.js";

const router = Router();

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const genderEnum = z.enum(["male", "female", "other", "prefer_not_to_say"]);
const paymentMethodEnum = z.enum(["cash", "upi", "card", "bank_transfer", "other"]);

const optionalEmail = z
  .union([z.string().email("Enter a valid email address"), z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);

const initialPaymentSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero"),
  method: paymentMethodEnum,
  paymentDate: z.string().optional(),
  transactionRef: z.string().nullish(),
  notes: z.string().nullish(),
});

const createMemberSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  email: optionalEmail,
  phone: z.string().trim().min(3, "Phone is required"),
  photoUrl: z.string().nullish(),
  dateOfBirth: z.string().nullish(),
  gender: genderEnum.nullish(),
  address: z.string().nullish(),
  emergencyContactName: z.string().nullish(),
  emergencyContactPhone: z.string().nullish(),
  joinDate: z.string().min(4, "Join date is required"),
  notes: z.string().nullish(),
  planId: z.string().min(1, "Plan is required"),
  membershipStart: z.string().min(4, "Membership start is required"),
  initialPayment: initialPaymentSchema.nullish(),
  /** Optional portal password for the member's own login (default: test@123). */
  loginPassword: z.string().min(6, "Portal password must be at least 6 characters").max(72).optional(),
});

const updateMemberSchema = createMemberSchema
  .partial()
  .omit({ planId: true, membershipStart: true, initialPayment: true, loginPassword: true })
  .extend({ status: z.enum(["active", "inactive"]).optional() });

const renewSchema = z.object({
  memberId: z.string().optional(),
  planId: z.string().min(1, "Plan is required"),
  startDate: z.string().optional(),
  discount: z.number().min(0).optional(),
  notes: z.string().nullish(),
  source: z.enum(["new", "renewal", "extension", "correction"]).optional(),
  initialPayment: initialPaymentSchema.nullish(),
});

const setMemberStatusSchema = z.object({ status: z.enum(["active", "inactive"]) });

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function findMemberOr404(gymId, id) {
  if (!Types.ObjectId.isValid(String(id))) throw notFound("Member not found");
  const member = await Member.findOne({ _id: id, gymId }).lean();
  if (!member) throw notFound("Member not found");
  return member;
}

const MEMBER_AUDIT_KEYS = [
  "fullName", "email", "phone", "photoUrl", "dateOfBirth", "gender", "address",
  "emergencyContactName", "emergencyContactPhone", "joinDate", "notes", "status",
];

/* ------------------------------------------------------------------ */
/*  Members CRUD                                                       */
/* ------------------------------------------------------------------ */

/** GET /api/members?search&status&planId&sort&dir&page&pageSize → Paginated<MemberWithMembership> */
router.get(
  "/members",
  requireAuth,
  requireCap("members.view"),
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    let rows = await decorateAllMembers(ctx.gym._id, ctx);

    const search = String(req.query.search ?? "").trim().toLowerCase();
    if (search) {
      const compactSearch = search.replace(/\s/g, "");
      rows = rows.filter(
        (m) =>
          m.fullName.toLowerCase().includes(search) ||
          m.memberCode.toLowerCase().includes(search) ||
          m.phone.replace(/\s/g, "").includes(compactSearch) ||
          (m.email?.toLowerCase().includes(search) ?? false),
      );
    }

    switch (req.query.status) {
      case "active":
        rows = rows.filter((m) => m.effectiveStatus === "active");
        break;
      case "expiring_soon":
        rows = rows.filter((m) => m.effectiveStatus === "expiring_soon");
        break;
      case "expired":
        rows = rows.filter((m) => m.effectiveStatus === "expired");
        break;
      case "suspended":
        rows = rows.filter((m) => m.effectiveStatus === "suspended");
        break;
      case "inactive":
        rows = rows.filter((m) => m.effectiveStatus === "inactive" || m.status === "inactive");
        break;
      default:
        break;
    }

    if (req.query.planId) {
      const planId = String(req.query.planId);
      rows = rows.filter((m) => m.membership?.planId === planId);
    }

    const dir = req.query.dir === "asc" ? 1 : -1;
    const sort = req.query.sort ?? "created";
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

    const page = intParam(req.query.page, 1);
    const pageSize = intParam(req.query.pageSize, 10, { min: 5, max: 100 });
    const start = (page - 1) * pageSize;
    res.json({ items: rows.slice(start, start + pageSize), total: rows.length, page, pageSize });
  }),
);

/** GET /api/members/:id → MemberWithMembership */
router.get(
  "/members/:id",
  requireAuth,
  requireCap("members.view"),
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    const member = await Member.findOne({ _id: req.params.id, gymId: ctx.gym._id }).lean();
    if (!member) throw notFound("Member not found");
    res.json(await decorateMember(member, ctx));
  }),
);

/** POST /api/members (MemberCreateInput) */
router.post(
  "/members",
  requireAuth,
  requireCap("members.create"),
  asyncHandler(async (req, res) => {
    const input = parseBody(createMemberSchema, req.body);
    const ctx = await loadGymContext(req.user.gymId);
    const gymId = ctx.gym._id;

    const plan = await MembershipPlan.findOne({ _id: input.planId, gymId }).lean();
    if (!plan) throw badRequest("Selected membership plan was not found", "invalid_plan");

    let created;
    try {
      created = await withTransaction(async (session) => {
        const dupPhone = await Member.findOne({ gymId, phone: input.phone })
          .select("_id")
          .session(session);
        if (dupPhone) throw conflict("A member with this phone number already exists", "duplicate_phone");
        if (input.email) {
          const dupEmail = await Member.findOne({ gymId, email: input.email })
            .select("_id")
            .session(session);
          if (dupEmail) throw conflict("A member with this email already exists", "duplicate_email");
        }

        const memberCode = await nextMemberCode(gymId, session);
        const [member] = await Member.create(
          [
            {
              gymId,
              memberCode,
              fullName: input.fullName,
              email: input.email ?? null,
              phone: input.phone,
              photoUrl: input.photoUrl ?? null,
              dateOfBirth: input.dateOfBirth ? parseDateOnly(input.dateOfBirth) : null,
              gender: input.gender ?? null,
              address: input.address ?? null,
              emergencyContactName: input.emergencyContactName ?? null,
              emergencyContactPhone: input.emergencyContactPhone ?? null,
              joinDate: parseDateOnly(input.joinDate),
              qrToken: generateQrToken(),
              qrStatus: "active",
              status: "active",
              notes: input.notes ?? null,
              createdBy: req.user.id,
            },
          ],
          { session },
        );

        // Portal login: the member can sign in with their member code.
        await ensureMemberLogin(
          {
            gymId,
            memberId: member._id,
            memberCode,
            fullName: input.fullName,
            phone: input.phone,
            password: input.loginPassword,
          },
          session,
        );

        const start = input.membershipStart
          ? parseDateOnly(input.membershipStart)
          : parseDateOnly(ymdInTz(ctx.now, ctx.tz));
        const end = parseDateOnly(planEndDate(start, plan));
        const [membership] = await MemberMembership.create(
          [
            {
              gymId,
              memberId: member._id,
              planId: plan._id,
              startDate: start,
              endDate: end,
              status: "active",
              price: plan.price,
              discount: 0,
              source: "new",
              notes: null,
              createdBy: req.user.id,
            },
          ],
          { session },
        );

        if (input.initialPayment) {
          await createPaymentRow(
            {
              gymId,
              actorId: req.user.id,
              memberId: member._id,
              membershipId: membership._id,
              amount: input.initialPayment.amount,
              method: input.initialPayment.method,
              paymentDate: input.initialPayment.paymentDate ?? ymd(start),
              transactionRef: input.initialPayment.transactionRef ?? null,
              notes: input.initialPayment.notes ?? null,
            },
            session,
          );
        }

        await writeAudit(
          {
            gymId,
            actorId: req.user.id,
            entity: "members",
            entityId: String(member._id),
            action: "create",
            newValues: { memberCode, fullName: member.fullName, planName: plan.name },
          },
          session,
        );

        return member;
      });
    } catch (err) {
      if (err?.code === 11000) throw conflict("A member with this phone or email already exists");
      throw err;
    }

    res.status(201).json(await decorateMember(created, ctx));
  }),
);

/** PATCH /api/members/:id (MemberUpdateInput) */
router.patch(
  "/members/:id",
  requireAuth,
  requireCap("members.edit"),
  asyncHandler(async (req, res) => {
    const input = parseBody(updateMemberSchema, req.body);
    const ctx = await loadGymContext(req.user.gymId);
    const member = await findMemberOr404(ctx.gym._id, req.params.id);

    const updates = {};
    const dateFields = new Set(["dateOfBirth", "joinDate"]);
    for (const key of MEMBER_AUDIT_KEYS) {
      if (input[key] !== undefined) {
        updates[key] = dateFields.has(key) ? (input[key] ? parseDateOnly(input[key]) : null) : input[key];
      }
    }
    if (input.email !== undefined) updates.email = input.email || null;
    if (input.status !== undefined) updates.status = input.status;

    if (updates.email) {
      const dupEmail = await Member.findOne({
        gymId: ctx.gym._id,
        email: updates.email,
        _id: { $ne: member._id },
      }).select("_id");
      if (dupEmail) throw conflict("A member with this email already exists", "duplicate_email");
    }
    if (updates.phone) {
      const dupPhone = await Member.findOne({
        gymId: ctx.gym._id,
        phone: updates.phone,
        _id: { $ne: member._id },
      }).select("_id");
      if (dupPhone) throw conflict("A member with this phone number already exists", "duplicate_phone");
    }

    const updated = await Member.findOneAndUpdate(
      { _id: member._id },
      { $set: updates },
      { new: true },
    ).lean();

    await writeAudit({
      gymId: ctx.gym._id,
      actorId: req.user.id,
      entity: "members",
      entityId: String(member._id),
      action: "update",
      oldValues: pick(member, MEMBER_AUDIT_KEYS),
      newValues: pick(updates, MEMBER_AUDIT_KEYS),
    });

    res.json(await decorateMember(updated, ctx));
  }),
);

/** DELETE /api/members/:id — blocked when payment history exists (deactivate instead). */
router.delete(
  "/members/:id",
  requireAuth,
  requireCap("members.delete"),
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    const member = await findMemberOr404(ctx.gym._id, req.params.id);

    const payments = await PaymentRecord.countDocuments({ memberId: member._id });
    if (payments > 0) {
      throw badRequest(
        "This member has payment history and cannot be deleted. Deactivate the member instead.",
        "has_payments",
      );
    }

    await withTransaction(async (session) => {
      await Member.deleteOne({ _id: member._id }, { session });
      await MemberMembership.deleteMany({ memberId: member._id }, { session });
      await AttendanceRecord.deleteMany({ memberId: member._id }, { session });
      await ClassEnrollment.deleteMany({ memberId: member._id }, { session });
      await writeAudit(
        {
          gymId: ctx.gym._id,
          actorId: req.user.id,
          entity: "members",
          entityId: String(member._id),
          action: "delete",
          oldValues: { memberCode: member.memberCode, fullName: member.fullName },
        },
        session,
      );
    });

    res.status(204).end();
  }),
);

/** PATCH /api/members/:id/status { status } */
router.patch(
  "/members/:id/status",
  requireAuth,
  requireCap("members.edit"),
  asyncHandler(async (req, res) => {
    const { status } = parseBody(setMemberStatusSchema, req.body);
    const ctx = await loadGymContext(req.user.gymId);
    const member = await findMemberOr404(ctx.gym._id, req.params.id);

    const updated = await Member.findOneAndUpdate(
      { _id: member._id },
      { $set: { status } },
      { new: true },
    ).lean();

    await writeAudit({
      gymId: ctx.gym._id,
      actorId: req.user.id,
      entity: "members",
      entityId: String(member._id),
      action: "set_status",
      oldValues: { status: member.status },
      newValues: { status },
    });

    res.json(await decorateMember(updated, ctx));
  }),
);

/* ------------------------------------------------------------------ */
/*  Memberships / QR / history                                         */
/* ------------------------------------------------------------------ */

/** GET /api/members/:id/memberships → MemberMembership[] (newest first) */
router.get(
  "/members/:id/memberships",
  requireAuth,
  requireCap("members.view"),
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    const member = await findMemberOr404(ctx.gym._id, req.params.id);
    const rows = await MemberMembership.find({ memberId: member._id })
      .sort({ startDate: -1 })
      .lean();
    const plans = await MembershipPlan.find({ gymId: ctx.gym._id }).lean();
    const planById = new Map(plans.map((p) => [String(p._id), p]));
    res.json(rows.map((row) => toMembership(row, planById.get(String(row.planId)))));
  }),
);

/** POST /api/members/:id/renew (RenewMembershipInput) → MemberMembership */
router.post(
  "/members/:id/renew",
  requireAuth,
  requireCap("members.edit"),
  asyncHandler(async (req, res) => {
    const input = parseBody(renewSchema, req.body);
    const ctx = await loadGymContext(req.user.gymId);
    const member = await findMemberOr404(ctx.gym._id, req.params.id);

    const plan = await MembershipPlan.findOne({
      _id: input.planId,
      gymId: ctx.gym._id,
      isActive: true,
    }).lean();
    if (!plan) throw badRequest("Selected plan was not found or is inactive", "invalid_plan");

    const discount = input.discount ?? 0;
    if (discount < 0 || discount > plan.price) {
      throw badRequest("Discount must be between 0 and the plan price", "invalid_discount");
    }

    const membership = await withTransaction(async (session) => {
      // Per-member lock so two renewals/scans cannot interleave.
      await Member.updateOne({ _id: member._id }, { $inc: { scanLock: 1 } }, { session });

      const existing = await MemberMembership.find({
        memberId: member._id,
        status: { $ne: "cancelled" },
      })
        .session(session)
        .lean();
      const current = currentMembership(existing);
      // renewalStartDate expects date-only strings; lean docs hold BSON Dates.
      const currentForStart = current ? { endDate: ymd(current.endDate) } : null;

      const start = input.startDate
        ? parseDateOnly(input.startDate)
        : parseDateOnly(renewalStartDate(ctx.now, currentForStart, ctx.tz));
      const end = parseDateOnly(planEndDate(start, plan));

      const [row] = await MemberMembership.create(
        [
          {
            gymId: ctx.gym._id,
            memberId: member._id,
            planId: plan._id,
            startDate: start,
            endDate: end,
            status: "active",
            price: plan.price,
            discount,
            source: input.source ?? "renewal",
            notes: input.notes ?? null,
            createdBy: req.user.id,
          },
        ],
        { session },
      );

      if (input.initialPayment) {
        await createPaymentRow(
          {
            gymId: ctx.gym._id,
            actorId: req.user.id,
            memberId: member._id,
            membershipId: row._id,
            amount: input.initialPayment.amount,
            method: input.initialPayment.method,
            transactionRef: input.initialPayment.transactionRef ?? null,
            notes: input.initialPayment.notes ?? null,
          },
          session,
        );
      }

      await writeAudit(
        {
          gymId: ctx.gym._id,
          actorId: req.user.id,
          entity: "member_memberships",
          entityId: String(row._id),
          action: "create",
          newValues: {
            memberCode: member.memberCode,
            planName: plan.name,
            startDate: ymd(start),
            endDate: ymd(end),
            price: plan.price,
            discount,
            source: row.source,
          },
        },
        session,
      );

      return row;
    });

    res.status(201).json(toMembership(membership, plan));
  }),
);

/** POST /api/members/:id/rotate-qr → Member (fresh token, never echoed to logs) */
router.post(
  "/members/:id/rotate-qr",
  requireAuth,
  requireCap("qr.regenerate"),
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    const member = await findMemberOr404(ctx.gym._id, req.params.id);

    const updated = await Member.findOneAndUpdate(
      { _id: member._id },
      { $set: { qrToken: generateQrToken(), qrRotatedAt: new Date(), qrStatus: "active" } },
      { new: true },
    ).lean();

    await writeAudit({
      gymId: ctx.gym._id,
      actorId: req.user.id,
      entity: "members",
      entityId: String(member._id),
      action: "rotate_qr",
      newValues: { qrRotatedAt: updated.qrRotatedAt },
    });

    res.json(toMember(updated));
  }),
);

/** GET /api/members/:id/attendance?limit=20 → AttendanceRecord[] (newest first) */
router.get(
  "/members/:id/attendance",
  requireAuth,
  requireCap("attendance.view"),
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    const member = await findMemberOr404(ctx.gym._id, req.params.id);
    const limit = intParam(req.query.limit, 20, { min: 1, max: 200 });
    const rows = await AttendanceRecord.find({ memberId: member._id })
      .sort({ checkIn: -1 })
      .limit(limit)
      .lean();
    res.json(rows.map((row) => toAttendance(row, member, null)));
  }),
);

/** GET /api/members/:id/payments?pageSize=20 → PaymentRecord[] (newest first) */
router.get(
  "/members/:id/payments",
  requireAuth,
  requireCap("payments.view"),
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    const member = await findMemberOr404(ctx.gym._id, req.params.id);
    const pageSize = intParam(req.query.pageSize, 20, { min: 1, max: 200 });
    const rows = await PaymentRecord.find({ memberId: member._id })
      .sort({ paymentDate: -1 })
      .limit(pageSize)
      .lean();

    const membershipIds = [...new Set(rows.map((r) => r.membershipId).filter(Boolean).map(String))];
    const memberships = membershipIds.length
      ? await MemberMembership.find({ _id: { $in: membershipIds } }).lean()
      : [];
    const membershipById = new Map(memberships.map((m) => [String(m._id), m]));
    const planIds = [...new Set(memberships.map((m) => String(m.planId)))];
    const plans = planIds.length ? await MembershipPlan.find({ _id: { $in: planIds } }).lean() : [];
    const planById = new Map(plans.map((p) => [String(p._id), p]));

    res.json(
      rows.map((row) => {
        const membership = row.membershipId ? membershipById.get(String(row.membershipId)) : null;
        const plan = membership ? planById.get(String(membership.planId)) : null;
        return toPayment(row, member, membership, plan);
      }),
    );
  }),
);

export default router;
