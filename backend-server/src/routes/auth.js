import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import User from "../models/User.js";
import Member from "../models/Member.js";
import { signToken, requireAuth } from "../middleware/auth.js";
import { parseBody } from "../middleware/validate.js";
import { asyncHandler, unauthorized } from "../lib/errors.js";
import { toPublicUser } from "../lib/serialize.js";

const router = Router();

const loginSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address").optional(),
    memberCode: z.string().trim().min(3, "Member code is too short").optional(),
    password: z.string().min(1, "Password is required"),
  })
  .refine((v) => v.email || v.memberCode, {
    message: "Email or member code is required",
    path: ["email"],
  });

/** POST /api/auth/login { email | memberCode, password } → { token, user } */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, memberCode, password } = parseBody(loginSchema, req.body);

    let user = null;
    if (memberCode) {
      // Legacy: identify by the printed member code (PG-0001).
      const member = await Member.findOne({ memberCode: memberCode.trim().toUpperCase() })
        .select("_id")
        .lean();
      if (member) user = await User.findOne({ memberId: member._id, role: "member" }).lean();
    } else {
      user = await User.findOne({ email: email.toLowerCase() }).lean();
      if (!user) {
        // Member portal: the member's own (real) email → their portal login.
        const member = await Member.findOne({ email: email.toLowerCase() })
          .select("_id")
          .lean();
        if (member) user = await User.findOne({ memberId: member._id, role: "member" }).lean();
      }
    }

    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) {
      throw unauthorized(
        memberCode ? "Invalid member code or password" : "Invalid email or password",
        "invalid_credentials",
      );
    }
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
