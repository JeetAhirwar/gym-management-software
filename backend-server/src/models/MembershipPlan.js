import mongoose from "mongoose";

const { Schema, model } = mongoose;

/** Sellable plan template. Plans referenced by memberships are archived, never deleted. */
const MembershipPlanSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    price: { type: Number, default: 0, min: 0 },
    durationValue: { type: Number, required: true, min: 1 },
    durationUnit: { type: String, enum: ["day", "week", "month", "year"], required: true },
    benefits: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false, collection: "membershipplans" },
);

MembershipPlanSchema.index(
  { gymId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
MembershipPlanSchema.index({ gymId: 1, isActive: 1, sortOrder: 1 });

export default model("MembershipPlan", MembershipPlanSchema);
