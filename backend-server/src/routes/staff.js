import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import StaffProfile from "../models/StaffProfile.js";
import { requireAuth, requireCap } from "../middleware/auth.js";
import { asyncHandler, notFound } from "../lib/errors.js";
import { parseBody } from "../middleware/validate.js";
import { toStaff } from "../lib/serialize.js";
import { writeAudit, pick } from "../lib/audit.js";
import { parseDateOnly } from "../lib/dates.js";

const router = Router();

const optionalEmail = z
  .union([z.string().email("Enter a valid email address"), z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);

const createStaffSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  email: optionalEmail,
  phone: z.string().trim().min(3, "Phone is required"),
  role: z.enum(["admin", "front_desk", "trainer"]),
  specialization: z.string().nullish(),
  employmentStatus: z.enum(["active", "on_leave", "resigned"]),
  joiningDate: z.string().min(4, "Joining date is required"),
  photoUrl: z.string().nullish(),
  notes: z.string().nullish(),
});

const updateStaffSchema = createStaffSchema
  .partial()
  .extend({
    role: z.enum(["owner", "admin", "front_desk", "trainer"]).optional(),
  });

const STAFF_KEYS = [
  "fullName", "email", "phone", "role", "specialization",
  "employmentStatus", "joiningDate", "photoUrl", "notes",
];

async function findStaffOr404(gymId, id) {
  if (!Types.ObjectId.isValid(String(id))) throw notFound("Staff member not found");
  const row = await StaffProfile.findOne({ _id: id, gymId }).lean();
  if (!row) throw notFound("Staff member not found");
  return row;
}

/** GET /api/staff?includeInactive=1 → StaffProfile[] */
router.get(
  "/staff",
  requireAuth,
  requireCap("staff.view"),
  asyncHandler(async (req, res) => {
    const includeInactive =
      req.query.includeInactive === "1" ||
      req.query.includeInactive === "true" ||
      req.query.includeInactive === undefined;
    const filter = { gymId: req.user.gymId };
    if (!includeInactive) filter.employmentStatus = "active";
    const rows = await StaffProfile.find(filter).sort({ fullName: 1 }).lean();
    res.json(rows.map(toStaff));
  }),
);

/** POST /api/staff */
router.post(
  "/staff",
  requireAuth,
  requireCap("staff.manage"),
  asyncHandler(async (req, res) => {
    const input = parseBody(createStaffSchema, req.body);
    const [row] = await StaffProfile.create([
      {
        gymId: req.user.gymId,
        profileId: null,
        fullName: input.fullName,
        email: input.email ?? null,
        phone: input.phone,
        role: input.role,
        specialization: input.specialization ?? null,
        employmentStatus: input.employmentStatus,
        joiningDate: parseDateOnly(input.joiningDate),
        photoUrl: input.photoUrl ?? null,
        notes: input.notes ?? null,
      },
    ]);

    await writeAudit({
      gymId: req.user.gymId,
      actorId: req.user.id,
      entity: "staff_profiles",
      entityId: String(row._id),
      action: "create",
      newValues: { name: row.fullName, role: row.role },
    });

    res.status(201).json(toStaff(row));
  }),
);

/** PATCH /api/staff/:id */
router.patch(
  "/staff/:id",
  requireAuth,
  requireCap("staff.manage"),
  asyncHandler(async (req, res) => {
    const input = parseBody(updateStaffSchema, req.body);
    const row = await findStaffOr404(req.user.gymId, req.params.id);

    const updates = {};
    for (const key of STAFF_KEYS) {
      if (input[key] !== undefined) {
        updates[key] = key === "joiningDate" ? parseDateOnly(input[key]) : input[key];
      }
    }
    if (input.email !== undefined) updates.email = input.email || null;

    const updated = await StaffProfile.findOneAndUpdate(
      { _id: row._id },
      { $set: updates },
      { new: true },
    ).lean();

    await writeAudit({
      gymId: req.user.gymId,
      actorId: req.user.id,
      entity: "staff_profiles",
      entityId: String(row._id),
      action: "update",
      oldValues: pick(row, STAFF_KEYS),
      newValues: pick(updates, STAFF_KEYS),
    });

    res.json(toStaff(updated));
  }),
);

/** PATCH /api/staff/:id/archive — marks the staff member resigned. */
router.patch(
  "/staff/:id/archive",
  requireAuth,
  requireCap("staff.manage"),
  asyncHandler(async (req, res) => {
    const row = await findStaffOr404(req.user.gymId, req.params.id);
    const updated = await StaffProfile.findOneAndUpdate(
      { _id: row._id },
      { $set: { employmentStatus: "resigned" } },
      { new: true },
    ).lean();

    await writeAudit({
      gymId: req.user.gymId,
      actorId: req.user.id,
      entity: "staff_profiles",
      entityId: String(row._id),
      action: "archive",
      oldValues: { employmentStatus: row.employmentStatus },
      newValues: { employmentStatus: "resigned" },
    });

    res.json(toStaff(updated));
  }),
);

export default router;
