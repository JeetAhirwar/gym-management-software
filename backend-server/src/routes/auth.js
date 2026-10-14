import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import User from "../models/User.js";
import { signToken, requireAuth } from "../middleware/auth.js";
import { parseBody } from "../middleware/validate.js";
import { asyncHandler, unauthorized } from "../lib/errors.js";
import { toPublicUser } from "../lib/serialize.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

/** POST /api/auth/login { email, password } → { token, user } */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = parseBody(loginSchema, req.body);
    const user = await User.findOne({ email: email.toLowerCase() }).lean();
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) throw unauthorized("Invalid email or password", "invalid_credentials");
    if (!user.isActive) throw unauthorized("This account is disabled", "account_disabled");

    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    res.json({ token: signToken(user), user: toPublicUser(user) });
  }),
);

/** GET /api/auth/me → the authenticated user. */
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).lean();
    if (!user) throw unauthorized();
    const shaped = toPublicUser(user);
    // Top-level fields plus a `user` alias — both shapes are harmless JSON.
    res.json({ ...shaped, user: shaped });
  }),
);

export default router;
