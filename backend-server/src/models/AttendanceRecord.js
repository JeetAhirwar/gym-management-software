import mongoose from "mongoose";

const { Schema, model } = mongoose;

/** Check-in history. Rows are created via the check-in flow only (audited). */
const AttendanceRecordSchema = new Schema(
  {
    gymId: { type: Schema.Types.ObjectId, ref: "Gym", required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true },
    membershipId: { type: Schema.Types.ObjectId, ref: "MemberMembership", default: null },
    checkIn: { type: Date, default: Date.now },
    checkOut: { type: Date, default: null },
    status: { type: String, enum: ["checked_in", "checked_out"], default: "checked_in" },
    method: { type: String, enum: ["qr", "manual", "class"], default: "qr" },
    scannerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    notes: { type: String, default: null },
    meta: { type: Object, default: {} },
  },
  { timestamps: true, versionKey: false, collection: "attendancerecords" },
);

AttendanceRecordSchema.index({ gymId: 1, checkIn: -1 });
AttendanceRecordSchema.index({ memberId: 1, checkIn: -1 });

export default model("AttendanceRecord", AttendanceRecordSchema);
