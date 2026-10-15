import { Router } from "express";
import { z } from "zod";
import Gym from "../models/Gym.js";
import GymSettings from "../models/GymSettings.js";
import { requireAuth, requireCap } from "../middleware/auth.js";
import { parseBody } from "../middleware/validate.js";
import { asyncHandler, badRequest } from "../lib/errors.js";
import { toGym, toSettings } from "../lib/serialize.js";
import { generateQrToken } from "../lib/qr.js";
import { writeAudit } from "../lib/audit.js";
import { loadGymContext } from "../services/context.js";

const router = Router();

const settingsPatchSchema = z.object({
  // Gym profile fields editable alongside settings.
  gymName: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  currency: z.string().min(1).optional(),
  logoUrl: z.string().nullish(),
  address: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  // GymSettings fields.
  checkinCooldownMinutes: z.number().int().min(0).max(1440).optional(),
  trackCheckout: z.boolean().optional(),
  expiringSoonDays: z.number().int().min(1).max(90).optional(),
  expiryReminderDays: z.array(z.number().int().min(0).max(365)).optional(),
  allowExpiredCheckin: z.boolean().optional(),
  enableEmail: z.boolean().optional(),
  enableSms: z.boolean().optional(),
  enableWhatsapp: z.boolean().optional(),
  enablePush: z.boolean().optional(),
  attendanceRetentionDays: z.number().int().min(1).max(3650).optional(),
});

/** GET /api/gym → Gym */
router.get(
  "/gym",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    res.json(toGym(ctx.gym));
  }),
);

/** GET /api/settings → GymSettings */
router.get(
  "/settings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    res.json(toSettings(ctx.settings));
  }),
);

/** PATCH /api/settings (GymSettingsPatch incl. gymName/timezone) → GymSettings */
router.patch(
  "/settings",
  requireAuth,
  requireCap("settings.manage"),
  asyncHandler(async (req, res) => {
    const input = parseBody(settingsPatchSchema, req.body);
    const { gym, settings } = await loadGymContext(req.user.gymId);

    const gymUpdates = {};
    if (input.gymName !== undefined) gymUpdates.name = input.gymName;
    if (input.timezone !== undefined) gymUpdates.timezone = input.timezone;
    if (input.currency !== undefined) gymUpdates.currency = input.currency;
    if (input.logoUrl !== undefined) gymUpdates.logoUrl = input.logoUrl ?? null;
    if (input.address !== undefined) gymUpdates.address = input.address ?? null;
    if (input.phone !== undefined) gymUpdates.phone = input.phone ?? null;
    if (input.email !== undefined) gymUpdates.email = input.email ?? null;

    const settingsUpdates = {};
    const settingKeys = [
      "checkinCooldownMinutes",
      "trackCheckout",
      "expiringSoonDays",
      "expiryReminderDays",
      "allowExpiredCheckin",
      "enableEmail",
      "enableSms",
      "enableWhatsapp",
      "enablePush",
      "attendanceRetentionDays",
    ];
    for (const key of settingKeys) {
      if (input[key] !== undefined) settingsUpdates[key] = input[key];
    }

    if (Object.keys(gymUpdates).length > 0) {
      await Gym.updateOne({ _id: gym._id }, { $set: gymUpdates });
    }
    if (Object.keys(settingsUpdates).length > 0) {
      await GymSettings.updateOne({ gymId: gym._id }, { $set: settingsUpdates }, { upsert: true });
    }

    await writeAudit({
      gymId: gym._id,
      actorId: req.user.id,
      entity: "gym_settings",
      entityId: String(gym._id),
      action: "update",
      oldValues: { gymName: gym.name, timezone: gym.timezone },
      newValues: { ...gymUpdates, ...settingsUpdates },
    });

    const ctx = await loadGymContext(req.user.gymId);
    res.json(toSettings(ctx.settings));
  }),
);

const gymPatchSchema = z.object({
  timeSlots: z
    .array(z.object({
      start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm, e.g. 06:00"),
      end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm, e.g. 11:59"),
    }))
    .max(48, "Too many slots")
    .optional(),
});

/** GET /api/gym/qr → { token } — the single front-desk gym QR members scan. */
router.get(
  "/gym/qr",
  requireAuth,
  requireCap("settings.manage"),
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    let token = ctx.gym.gymQrToken;
    if (!token) {
      token = generateQrToken();
      await Gym.updateOne({ _id: ctx.gym._id }, { $set: { gymQrToken: token } });
    }
    res.json({ token });
  }),
);

/** POST /api/gym/qr/rotate → { token } — invalidates every previously printed gym QR. */
router.post(
  "/gym/qr/rotate",
  requireAuth,
  requireCap("settings.manage"),
  asyncHandler(async (req, res) => {
    const ctx = await loadGymContext(req.user.gymId);
    const token = generateQrToken();
    await Gym.updateOne({ _id: ctx.gym._id }, { $set: { gymQrToken: token } });
    await writeAudit({
      gymId: ctx.gym._id,
      actorId: req.user.id,
      entity: "gyms",
      entityId: String(ctx.gym._id),
      action: "update",
      newValues: { gymQrRotated: true },
    });
    res.json({ token });
  }),
);

/** PATCH /api/gym { timeSlots } → updated gym (front-desk slot schedule). */
router.patch(
  "/gym",
  requireAuth,
  requireCap("settings.manage"),
  asyncHandler(async (req, res) => {
    const input = parseBody(gymPatchSchema, req.body);
    if (input.timeSlots === undefined) throw badRequest("Nothing to update", "empty_patch");
    const ctx = await loadGymContext(req.user.gymId);
    const timeSlots = [...input.timeSlots].sort((a, b) => a.start.localeCompare(b.start));
    await Gym.updateOne({ _id: ctx.gym._id }, { $set: { timeSlots } });
    await writeAudit({
      gymId: ctx.gym._id,
      actorId: req.user.id,
      entity: "gyms",
      entityId: String(ctx.gym._id),
      action: "update",
      oldValues: { timeSlots: ctx.gym.timeSlots ?? [] },
      newValues: { timeSlots },
    });
    res.json(toGym({ ...ctx.gym, timeSlots }));
  }),
);

export default router;
