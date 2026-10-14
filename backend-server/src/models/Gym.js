import mongoose from "mongoose";

const { Schema, model } = mongoose;

const GymSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    timezone: { type: String, default: "Asia/Kolkata" },
    currency: { type: String, default: "INR" },
    logoUrl: { type: String, default: null },
    address: { type: String, default: null },
    phone: { type: String, default: null },
    email: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false, collection: "gyms" },
);

export default model("Gym", GymSchema);
