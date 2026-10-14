import mongoose from "mongoose";

const { Schema, model } = mongoose;

/** Authenticated staff user (the old `profiles` table + password hash). */
const UserSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true, index: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: null },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["owner", "admin", "front_desk", "trainer"],
      default: "front_desk",
    },
    avatarUrl: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false, collection: "users" },
);

UserSchema.index({ gymId: 1, role: 1 });

export default model("User", UserSchema);
