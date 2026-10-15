import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import AttendanceRecord from "../models/AttendanceRecord.js";
import Member from "../models/Member.js";
import MemberMembership from "../models/MemberMembership.js";
import MembershipPlan from "../models/MembershipPlan.js";
import User from "../models/User.js";
import { requireAuth, requireCap } from "../middleware/auth.js";
import { asyncHandler, badRequest, notFound } from "../lib/errors.js";
import { parseBody, intParam } from "../middleware/validate.js";
import { toAttendance } from "../lib/serialize.js";
import { parseQrPayload } from "../lib/qr.js";
import { writeAudit } from "../lib/audit.js";
import {
  startOfDayInTz,
  addDays,
  hourInTz,
  hourLabel,
} from "../lib/dates.js";
import { loadGymContext } from "../services/context.js";
import { runCheckIn } from "../services/checkin.js";

const router = Router();

const scanMethod = z.enum(["qr", "manual", "class"]);

const checkinTokenSchema = z.object({
  token: z.string().min(1, "QR token is required"),
  method: scanMethod.optional(),
  notes: z.string().nullish(),
});

const checkinCodeSchema = z.object({
  code: z.string().min(1, "Member code is required"),
  method: scanMethod.optional(),
  notes: z.string().nullish(),
});

const correctionSchema = z.object({
  checkIn: z.string().optional(),
  checkOut: z.string().nullish(),
  notes: z.string().nullish(),
});

const checkoutSchema = z.object({}).optional();

/* ------------------------------------------------------------------ */
/*  Check-in (always HTTP 200; body carries ok/rejected)               */
/* ------------------------------------------------------------------ */

/** POST /api/attendance/checkin { token, method?, notes? } → CheckInResult */
router.post(
  "/attendance/checkin",
  requireAuth,
  requireCap("qr.scan"),
  asyncHandler(async (req, res) => {
    const input = parseBody(checkinTokenSchema, req.body);
    const ctx = await loadGymContext(req.user.gymId);
    // Tolerate both the bare token and the "PGS1:<token>" payload.
    const token = parseQrPayload(input.token) ?? String(input.token).trim();
    const result = await runCheckIn({
      gymId: ctx.gym._id,
      actorId: req.user.id,
      lookup: { token },
      method: input.method ?? "qr",
      notes: input.notes ?? null,
      ctx,
    });
    res.json(result);
  }),
);

/** POST /api/attendance/checkin-code { code, method?, notes? } → CheckInResult */
router.post(
  "/attendance/checkin-code",
  requireAuth,
  requireCap("qr.scan"),
  asyncHandler(async (req, res) => {
    const input = parseBody(checkinCodeSchema, req.body);
    const ctx = await loadGymContext(req.user.gymId);
    const result = await runCheckIn({
      gymId: ctx.gym._id,
      actorId: req.user.id,
      lookup: { code: input.code },
      method: input.method ?? "qr",
      notes: input.notes ?? null,
      ctx,
    });
    res.json(result);
  }),
);

/** POST /api/attendance/:id/checkout → AttendanceRecord */
router.post(
  "/attendance/:id/checkout",
  requireAuth,
  requireCap("attendance.correct"),
  asyncHandler(async (req, res) => {
    parseBody(checkoutSchema, req.body);
    const record = await AttendanceRecord.findOne({
      _id: req.params.id,
      gymId: req.user.gymId,
    }).lean();
    if (!record) throw notFound("Attendance record not found");
    if (record.status === "checked_out") {
      throw badRequest("This member has already checked out", "already_checked_out");
    }

    const updated = await AttendanceRecord.findOneAndUpdate(
      { _id: record._id },
      { $set: { checkOut: new Date(), status: "checked_out" } },
      { new: true },
    ).lean();

    const member = await Member.findById(updated.memberId).lean();
    const scanner = updated.scannerId ? await User.findById(updated.scannerId).lean() : null;

    await writeAudit({
      gymId: record.gymId,
      actorId: req.user.id,
      entity: "attendance_records",
      entityId: String(record._id),
      action: "checkout",
      oldValues: { status: record.status, checkOut: null },
      newValues: { status: "checked_out" },
    });

    res.json(toAttendance(updated, member, scanner));
  }),
);

/* ------------------------------------------------------------------ */
/*  Listing + reports                                                  */
/* ------------------------------------------------------------------ */

/** GET /api/attendance?from&to&memberId&status&page&pageSize → Paginated<AttendanceRecord> */
router.get(
  "/attendance",
  requireAuth,
  requireCap("attendance.view"),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const filter = { gymId };
    if (req.query.from) filter.checkIn = { ...filter.checkIn, $gte: new Date(String(req.query.from)) };
    if (req.query.to) filter.checkIn = { ...filter.checkIn, $lte: new Date(String(req.query.to)) };
    if (req.query.memberId && Types.ObjectId.isValid(String(req.query.memberId))) {
      filter.memberId = req.query.memberId;
    }
    if (req.query.status === "checked_in" || req.query.status === "checked_out") {
      filter.status = req.query.status;
    }

    const page = intParam(req.query.page, 1);
    const pageSize = intParam(req.query.pageSize, 15, { min: 5, max: 100 });
    const [total, rows] = await Promise.all([
      AttendanceRecord.countDocuments(filter),
      AttendanceRecord.find(filter)
        .sort({ checkIn: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    const memberIds = [...new Set(rows.map((r) => String(r.memberId)))];
    const scannerIds = [...new Set(rows.map((r) => r.scannerId).filter(Boolean).map(String))];
    const membershipIds = [...new Set(rows.map((r) => String(r.membershipId)).filter((v) => v && v !== "null" && v !== "undefined"))];
    const [members, scanners, memberships, plans] = await Promise.all([
      memberIds.length ? Member.find({ _id: { $in: memberIds } }).lean() : [],
      scannerIds.length ? User.find({ _id: { $in: scannerIds } }).select("fullName").lean() : [],
      membershipIds.length ? MemberMembership.find({ _id: { $in: membershipIds } }).select("planId").lean() : [],
      MembershipPlan.find({ gymId }).select("name").lean(),
    ]);
    const memberById = new Map(members.map((m) => [String(m._id), m]));
    const scannerById = new Map(scanners.map((s) => [String(s._id), s]));
    const planById = new Map(plans.map((p) => [String(p._id), p.name]));
    const planNameByMembership = new Map(memberships.map((m) => [String(m._id), planById.get(String(m.planId)) ?? null]));

    res.json({
      items: rows.map((row) => ({
        ...toAttendance(
          row,
          memberById.get(String(row.memberId)),
          row.scannerId ? scannerById.get(String(row.scannerId)) : null,
        ),
        planName: planNameByMembership.get(String(row.membershipId)) ?? null,
      })),
      total,
      page,
      pageSize,
    });
  }),
);

/** PATCH /api/attendance/:id { checkIn?, checkOut?, notes? } (role: attendance.correct) */
router.patch(
  "/attendance/:id",
  requireAuth,
  requireCap("attendance.correct"),
  asyncHandler(async (req, res) => {
    const input = parseBody(correctionSchema, req.body);
    const record = await AttendanceRecord.findOne({
      _id: req.params.id,
      gymId: req.user.gymId,
    }).lean();
    if (!record) throw notFound("Attendance record not found");

    const updates = {};
    if (input.checkIn) updates.checkIn = new Date(input.checkIn);
    if (input.checkOut !== undefined) {
      updates.checkOut = input.checkOut ? new Date(input.checkOut) : null;
    }
    if (input.notes !== undefined) updates.notes = input.notes ?? null;

    const checkIn = updates.checkIn ?? record.checkIn;
    const checkOut = updates.checkOut !== undefined ? updates.checkOut : record.checkOut;
    updates.status = checkOut ? "checked_out" : "checked_in";
    if (checkOut && new Date(checkOut) < new Date(checkIn)) {
      throw badRequest("Check-out must not be before check-in", "invalid_range");
    }

    const updated = await AttendanceRecord.findOneAndUpdate(
      { _id: record._id },
      { $set: updates },
      { new: true },
    ).lean();

    const member = await Member.findById(updated.memberId).lean();
    const scanner = updated.scannerId ? await User.findById(updated.scannerId).lean() : null;

    await writeAudit({
      gymId: record.gymId,
      actorId: req.user.id,
      entity: "attendance_records",
      entityId: String(record._id),
      action: "correct_attendance",
      oldValues: { checkIn: record.checkIn, checkOut: record.checkOut, notes: record.notes, status: record.status },
      newValues: { checkIn: updated.checkIn, checkOut: updated.checkOut, notes: updated.notes, status: updated.status },
    });

    res.json(toAttendance(updated, member, scanner));
  }),
);

/* ------------------------------------------------------------------ */
/*  Reports                                                            */
/* ------------------------------------------------------------------ */

function parseRange(req, ctx) {
  const now = ctx.now;
  let from = req.query.from ? new Date(String(req.query.from)) : startOfDayInTz(addDays(now, -6), ctx.tz);
  let to = req.query.to ? new Date(String(req.query.to)) : new Date(now.getTime() + 1);
  if (Number.isNaN(from.getTime())) from = startOfDayInTz(addDays(now, -6), ctx.tz);
  if (Number.isNaN(to.getTime())) to = new Date(now.getTime() + 1);
  return { from, to };
}

/** GET /api/attendance/summary?from&to → AttendanceReportSummary */
router.get(
  "/attendance/summary",
  requireAuth,
  requireCap("reports.view"),
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    const { from, to } = parseRange(req, ctx);

    const rows = await AttendanceRecord.find({
      gymId: ctx.gym._id,
      checkIn: { $gte: from, $lte: to },
    })
      .select("memberId status checkIn checkOut")
      .lean();

    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
    const hourCounts = new Array(24).fill(0);
    for (const row of rows) hourCounts[hourInTz(new Date(row.checkIn), ctx.tz)] += 1;

    let busiestHour = null;
    let best = 0;
    for (let hour = 0; hour < 24; hour += 1) {
      if (hourCounts[hour] > best) {
        best = hourCounts[hour];
        busiestHour = hour;
      }
    }

    // Time spent per visit, capped at 12h so a forgotten check-out cannot skew totals.
    const MAX_VISIT_MS = 43_200_000;
    const nowMs = Math.min(ctx.now.getTime(), to.getTime());
    let totalMs = 0;
    for (const row of rows) {
      const end = row.checkOut ? new Date(row.checkOut).getTime() : nowMs;
      totalMs += Math.min(Math.max(0, end - new Date(row.checkIn).getTime()), MAX_VISIT_MS);
    }

    res.json({
      totalVisits: rows.length,
      uniqueMembers: new Set(rows.map((r) => String(r.memberId))).size,
      averagePerDay: Math.round((rows.length / days) * 10) / 10,
      busiestHour,
      checkIns: rows.filter((r) => r.status === "checked_in").length,
      totalHours: Math.round((totalMs / 3_600_000) * 10) / 10,
    });
  }),
);

/** GET /api/attendance/peak-hours?from&to → PeakHour[] (24 buckets, gym tz) */
router.get(
  "/attendance/peak-hours",
  requireAuth,
  requireCap("reports.view"),
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    const { from, to } = parseRange(req, ctx);

    const rows = await AttendanceRecord.find({
      gymId: ctx.gym._id,
      checkIn: { $gte: from, $lte: to },
    })
      .select("checkIn")
      .lean();

    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: hourLabel(hour),
      count: 0,
    }));
    for (const row of rows) {
      const hour = hourInTz(new Date(row.checkIn), ctx.tz);
      if (buckets[hour]) buckets[hour].count += 1;
    }
    res.json(buckets);
  }),
);

/** GET /api/attendance/frequencies?from&to&limit=10 → MemberFrequency[] */
router.get(
  "/attendance/frequencies",
  requireAuth,
  requireCap("reports.view"),
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    const { from, to } = parseRange(req, ctx);
    const limit = intParam(req.query.limit, 10, { min: 1, max: 50 });

    const rows = await AttendanceRecord.aggregate([
      { $match: { gymId: ctx.gym._id, checkIn: { $gte: from, $lte: to } } },
      { $group: { _id: "$memberId", visits: { $sum: 1 } } },
      { $sort: { visits: -1 } },
      { $limit: limit },
    ]);

    const members = await Member.find({ _id: { $in: rows.map((r) => r._id) } })
      .select("memberCode fullName")
      .lean();
    const memberById = new Map(members.map((m) => [String(m._id), m]));

    res.json(
      rows.map((row) => {
        const member = memberById.get(String(row._id));
        return {
          memberId: String(row._id),
          memberCode: member?.memberCode ?? "",
          memberName: member?.fullName ?? "Member",
          visits: row.visits,
        };
      }),
    );
  }),
);

export default router;
