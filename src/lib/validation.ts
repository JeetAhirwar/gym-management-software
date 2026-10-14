import { z } from "zod";

/**
 * Reusable Zod schemas shared by React Hook Form screens and the data layer
 * (the demo service re-validates every mutation server-side style).
 */

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .regex(/^\+?[0-9][0-9\s-]{8,16}$/, "Enter a valid phone number");

export const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .max(254)
  .optional()
  .or(z.literal(""));

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Use a valid date");

export const memberFormSchema = z
  .object({
    fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
    email: emailSchema,
    phone: phoneSchema,
    dateOfBirth: z.union([dateOnlySchema, z.literal("")]).optional(),
    gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
    address: z.string().trim().max(400).optional(),
    emergencyContactName: z.string().trim().max(120).optional(),
    emergencyContactPhone: z.union([phoneSchema, z.literal("")]).optional(),
    joinDate: dateOnlySchema,
    planId: z.string().min(1, "Choose a membership plan"),
    membershipStart: dateOnlySchema,
    initialPayment: z
      .number()
      .min(0, "Amount cannot be negative")
      .max(10_000_000, "Amount looks too large")
      .optional(),
    photoUrl: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => !data.emergencyContactPhone || data.emergencyContactPhone.length > 0, {
    message: "Enter a valid emergency contact phone or leave it empty",
    path: ["emergencyContactPhone"],
  });

export type MemberFormValues = z.infer<typeof memberFormSchema>;

export const planFormSchema = z.object({
  name: z.string().trim().min(2, "Plan name must be at least 2 characters").max(80),
  description: z.string().trim().max(500).optional(),
  price: z
    .number({ invalid_type_error: "Enter a price" })
    .min(0, "Price cannot be negative")
    .max(10_000_000, "Price looks too large"),
  durationValue: z
    .number({ invalid_type_error: "Enter a duration" })
    .int("Duration must be a whole number")
    .min(1, "Duration must be at least 1")
    .max(120, "Duration looks too large"),
  durationUnit: z.enum(["day", "week", "month", "year"]),
  benefits: z.string().optional(),
  isActive: z.boolean(),
});

export type PlanFormValues = z.infer<typeof planFormSchema>;

export const paymentFormSchema = z.object({
  memberId: z.string().min(1, "Choose a member"),
  membershipId: z.string().optional(),
  amount: z
    .number({ invalid_type_error: "Enter an amount" })
    .positive("Amount must be greater than zero")
    .max(10_000_000, "Amount looks too large"),
  paymentDate: dateOnlySchema,
  method: z.enum(["cash", "upi", "card", "bank_transfer", "other"]),
  status: z.enum(["paid", "partial", "pending"]),
  transactionRef: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export const refundFormSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero"),
  reason: z.string().trim().min(3, "Explain the reason for the refund").max(500),
});

export const staffFormSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: emailSchema,
  phone: phoneSchema,
  role: z.enum(["admin", "front_desk", "trainer"]),
  specialization: z.string().trim().max(160).optional(),
  employmentStatus: z.enum(["active", "on_leave", "resigned"]),
  joiningDate: dateOnlySchema,
  photoUrl: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type StaffFormValues = z.infer<typeof staffFormSchema>;

export const classFormSchema = z
  .object({
    name: z.string().trim().min(2, "Class name must be at least 2 characters").max(120),
    description: z.string().trim().max(500).optional(),
    trainerId: z.string().optional(),
    date: dateOnlySchema,
    time: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm format"),
    durationMinutes: z
      .number({ invalid_type_error: "Enter a duration" })
      .int("Duration must be a whole number")
      .min(10, "Minimum 10 minutes")
      .max(480, "Maximum 8 hours"),
    capacity: z
      .number({ invalid_type_error: "Enter capacity" })
      .int("Capacity must be a whole number")
      .min(1, "Minimum 1 seat")
      .max(500, "Capacity looks too large"),
  });

export type ClassFormValues = z.infer<typeof classFormSchema>;

export const renewalFormSchema = z.object({
  planId: z.string().min(1, "Choose a plan"),
  startDate: dateOnlySchema,
  discount: z.number().min(0, "Discount cannot be negative").max(10_000_000),
  notes: z.string().trim().max(500).optional(),
});

export type RenewalFormValues = z.infer<typeof renewalFormSchema>;

export const manualCheckInSchema = z.object({
  memberCode: z.string().trim().min(2, "Enter a member ID or phone number"),
});

export const settingsFormSchema = z.object({
  gymName: z.string().trim().min(2, "Gym name is required").max(120),
  timezone: z.string().min(3, "Timezone is required"),
  checkinCooldownMinutes: z
    .number()
    .int("Must be a whole number of minutes")
    .min(0, "Cannot be negative")
    .max(1440, "Maximum 24 hours"),
  trackCheckout: z.boolean(),
  expiringSoonDays: z.number().int().min(1).max(90),
  expiryReminderDays: z.string().min(1, "Provide at least one reminder day"),
  allowExpiredCheckin: z.boolean(),
  enableEmail: z.boolean(),
  enableSms: z.boolean(),
  enableWhatsapp: z.boolean(),
  enablePush: z.boolean(),
});

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/** Coerce an RHF numeric field value (comes back as string) to number. */
export function numericValue(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[, ]/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}
