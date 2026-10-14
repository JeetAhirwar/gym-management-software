// Backfill portal logins for every member that doesn't have one yet.
// Idempotent — safe to run any time. Usage: node scripts/backfill-member-logins.js
import { connectDb, disconnectDb } from "../src/db.js";
import Member from "../src/models/Member.js";
import { ensureMemberLogin, MEMBER_DEFAULT_PASSWORD } from "../src/lib/memberLogins.js";

async function main() {
  await connectDb();
  const members = await Member.find({}).select("gymId memberCode fullName phone").lean();

  let created = 0;
  let skipped = 0;
  for (const member of members) {
    const user = await ensureMemberLogin({
      gymId: member.gymId,
      memberId: member._id,
      memberCode: member.memberCode,
      fullName: member.fullName,
      phone: member.phone,
    });
    if (user) created += 1;
    else skipped += 1;
  }

  console.log(
    `Member logins: ${created} created, ${skipped} already existed (default password: ${MEMBER_DEFAULT_PASSWORD})`,
  );
  await disconnectDb();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
