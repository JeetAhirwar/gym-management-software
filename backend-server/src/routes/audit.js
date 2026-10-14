import { Router } from "express";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/errors.js";
import { toAudit } from "../lib/serialize.js";
import { intParam } from "../middleware/validate.js";

const router = Router();

/** GET /api/audit?limit=50 → AuditLog[] (actorName populated) */
router.get(
  "/audit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = intParam(req.query.limit, 50, { min: 1, max: 200 });
    const rows = await AuditLog.find({ gymId: req.user.gymId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean).map(String))];
    const actors = actorIds.length
      ? await User.find({ _id: { $in: actorIds } }).select("fullName").lean()
      : [];
    const actorById = new Map(actors.map((a) => [String(a._id), a]));

    res.json(rows.map((row) => toAudit(row, actorById.get(String(row.actorId)))));
  }),
);

export default router;
