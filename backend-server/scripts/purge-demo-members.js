// Remove every DEMO member (DEMO-90xx) and everything attached to them:
// memberships, attendance, payments, class enrollments, portal logins — then
// rebuild the gym's notifications from the remaining real data.
// Idempotent. Real members (e.g. PG-0001) are untouched.
// Usage: node scripts/purge-demo-members.js
import { connectDb, disconnectDb } from "../src/db.js";
import Member from "../src/models/Member.js";
import MemberMembership from "../src/models/MemberMembership.js";
import AttendanceRecord from "../src/models/AttendanceRecord.js";
import PaymentRecord from "../src/models/PaymentRecord.js";
import ClassEnrollment from "../src/models/ClassEnrollment.js";
import User from "../src/models/User.js";
import { rebuildNotifications } from "../src/services/notifications.js";
import { loadGymContext } from "../src/services/context.js";

async function main() {
  await connectDb();

  const demoMembers = await Member.find({ memberCode: /^DEMO-/ })
    .select("memberCode fullName gymId")
    .lean();

  if (demoMembers.length === 0) {
    console.log("No DEMO members found — nothing to purge.");
    await disconnectDb();
    return;
  }

  const gymIds = new Set();
  const tally = { members: 0, memberships: 0, attendance: 0, payments: 0, enrollments: 0, logins: 0 };

  for (const member of demoMembers) {
    gymIds.add(String(member.gymId));
    const memberId = member._id;

    tally.memberships += (await MemberMembership.deleteMany({ memberId })).deletedCount ?? 0;
    tally.attendance += (await AttendanceRecord.deleteMany({ memberId })).deletedCount ?? 0;
    tally.payments += (await PaymentRecord.deleteMany({ memberId })).deletedCount ?? 0;
    tally.enrollments += (await ClassEnrollment.deleteMany({ memberId })).deletedCount ?? 0;
    tally.logins += (await User.deleteMany({ memberId, role: "member" })).deletedCount ?? 0;
    tally.members += (await Member.deleteOne({ _id: memberId })).deletedCount ?? 0;

    console.log(`removed ${member.memberCode} (${member.fullName})`);
  }

  // Notifications embed member references — rebuild from what's left.
  for (const gymId of gymIds) {
    const ctx = await loadGymContext(gymId);
    await rebuildNotifications(gymId, ctx);
  }

  console.log("Purge complete:", JSON.stringify(tally));
  await disconnectDb();
}

main().catch((err) => {
  console.error("Purge failed:", err);
  process.exit(1);
});
