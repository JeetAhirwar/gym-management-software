/**
 * One-off data backfill — makes the gym look alive: realistic check-in /
 * check-out history for the last 2 days (gym timezone), honouring each gym's
 * configured time slots, membership windows and planned hours per day.
 *
 * Idempotent: (member, day) pairs that already have a record are skipped, so
 * it is safe to re-run and safe alongside real front-desk scans.
 *
 * Usage:  cd backend-server && node scripts/backfill-attendance.js
 */
import Gym from "../src/models/Gym.js";
import Member from "../src/models/Member.js";
import MemberMembership from "../src/models/MemberMembership.js";
import AttendanceRecord from "../src/models/AttendanceRecord.js";
import AppNotification from "../src/models/AppNotification.js";
import User from "../src/models/User.js";
import { connectDb, disconnectDb } from "../src/db.js";
import { ymd } from "../src/lib/serialize.js";
import { loadGymContext } from "../src/services/context.js";
import { rebuildNotifications } from "../src/services/notifications.js";

const DEFAULT_SLOTS = [
  { start: "06:00", end: "11:59" },
  { start: "12:00", end: "15:59" },
  { start: "16:00", end: "19:59" },
];

/** Deterministic PRNG (mulberry32) seeded from a string — stable per key. */
function seededRandom(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wall-clock parts of `date` in `timeZone`. */
function tzParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const out = {};
  for (const part of fmt.formatToParts(date)) out[part.type] = part.value;
  return {
    y: Number(out.year),
    mo: Number(out.month),
    d: Number(out.day),
    h: Number(out.hour) % 24, // some engines report midnight as 24
    mi: Number(out.minute),
  };
}

function addDays({ y, mo, d }, delta) {
  const t = new Date(Date.UTC(y, mo - 1, d + delta));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const dayKey = ({ y, mo, d }) =>
  `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Close check-ins left open for > 6h (stale scans) with a plausible session
 * length, so "currently inside" only ever shows today's real visits.
 */
async function closeStaleOpen(gymId, now) {
  const cutoff = new Date(now.getTime() - 6 * 3600_000);
  const stale = await AttendanceRecord.find({ gymId, status: "checked_in", checkIn: { $lt: cutoff } }).lean();
  for (const row of stale) {
    const rng = seededRandom(`close:${row._id}`);
    const durationMin = 80 + Math.floor(rng() * 70); // 80–150 min session
    await AttendanceRecord.updateOne(
      { _id: row._id },
      {
        $set: {
          checkOut: new Date(new Date(row.checkIn).getTime() + durationMin * 60_000),
          status: "checked_out",
        },
      },
    );
  }
  return stale.length;
}

async function backfillGym(gym, now) {
  const gymId = gym._id;
  const tz = gym.timezone ?? "Asia/Kolkata";
  const nowParts = tzParts(now, tz);
  // Fixed offset across these 2 days (IST has no DST); derived from now.
  const offsetMs =
    Date.UTC(nowParts.y, nowParts.mo - 1, nowParts.d, nowParts.h, nowParts.mi) - now.getTime();
  const wallToUtc = (parts, h, mi) =>
    new Date(Date.UTC(parts.y, parts.mo - 1, parts.d, h, mi) - offsetMs);

  const slots = gym.timeSlots?.length ? gym.timeSlots : DEFAULT_SLOTS;
  const scanner = await User.findOne({ gymId, role: { $in: ["admin", "front_desk"] } }).lean();

  const members = await Member.find({ gymId, status: "active" }).lean();
  const memberships = await MemberMembership.find({ gymId }).lean();
  const byMember = new Map();
  for (const mship of memberships) {
    const key = String(mship.memberId);
    if (!byMember.has(key)) byMember.set(key, []);
    byMember.get(key).push(mship);
  }

  // Days that already have a record per member (idempotency + real scans).
  const windowStart = wallToUtc(addDays(nowParts, -1), 0, 0);
  const existingRows = await AttendanceRecord.find({ gymId, checkIn: { $gte: windowStart } }).lean();
  const existingByMember = new Map();
  for (const row of existingRows) {
    const key = String(row.memberId);
    if (!existingByMember.has(key)) existingByMember.set(key, new Set());
    existingByMember.get(key).add(dayKey(tzParts(row.checkIn, tz)));
  }

  const stats = { inserted: 0, existing: 0, future: 0, noMembership: 0, absent: 0, open: 0 };
  const rows = [];

  for (const offset of [-1, 0]) {
    const day = addDays(nowParts, offset);
    const dayStr = dayKey(day);

    for (const member of members) {
      const mKey = String(member._id);
      if (existingByMember.get(mKey)?.has(dayStr)) {
        stats.existing += 1;
        continue;
      }
      // "Appetite": stable per member (0.55–0.95) — regulars show up most days.
      const appetite = 0.55 + seededRandom(`appetite:${member.memberCode}`)() * 0.4;
      const dayRng = seededRandom(`${member.memberCode}:${dayStr}`);
      if (dayRng() > appetite) {
        stats.absent += 1;
        continue;
      }

      // Governing membership for that day (active preferred, then latest end).
      const candidates = (byMember.get(mKey) ?? [])
        .filter((mship) => {
          const s = mship.status;
          return (
            (s === "active" || s === "expired") &&
            ymd(mship.startDate) <= dayStr &&
            ymd(mship.endDate) >= dayStr
          );
        })
        .sort(
          (a, b) =>
            (b.status === "active" ? 1 : 0) - (a.status === "active" ? 1 : 0) ||
            new Date(b.endDate) - new Date(a.endDate),
        );
      const membership = candidates[0] ?? null;
      if (!membership) {
        stats.noMembership += 1;
        continue;
      }

      // Their usual slot — stable per member (morning / afternoon / evening regular).
      const slotIndex = Math.floor(seededRandom(`slot:${member.memberCode}`)() * slots.length);
      const slot = slots[slotIndex] ?? slots[0];
      const [sh, sm] = slot.start.split(":").map(Number);
      const slotStart = wallToUtc(day, sh, sm);

      // Arrive: mostly on time, sometimes late.
      const late = dayRng() < 0.15;
      const arriveMin = late ? 30 + Math.floor(dayRng() * 26) : 2 + Math.floor(dayRng() * 24);
      const checkIn = new Date(slotStart.getTime() + arriveMin * 60_000);
      if (checkIn.getTime() > now.getTime()) {
        stats.future += 1;
        continue;
      }

      // Session length: honours planned hours per day when set.
      const plannedMin =
        Number(member.plannedHoursPerDay) > 0 ? Math.round(Number(member.plannedHoursPerDay) * 60) : 0;
      const baseMin =
        plannedMin > 0 ? Math.min(240, Math.max(60, plannedMin)) : 70 + Math.floor(dayRng() * 80);
      const durationMin = Math.max(35, baseMin + Math.floor(dayRng() * 21) - 10);
      let checkOut = new Date(checkIn.getTime() + durationMin * 60_000);
      let status = "checked_out";
      if (checkOut.getTime() > now.getTime()) {
        // Session still running → member is inside right now.
        if (now.getTime() - checkIn.getTime() < 4 * 3600_000) {
          status = "checked_in";
          checkOut = null;
          stats.open += 1;
        } else {
          stats.future += 1;
          continue;
        }
      }

      if (!existingByMember.has(mKey)) existingByMember.set(mKey, new Set());
      existingByMember.get(mKey).add(dayStr); // one session per member per day
      stats.inserted += 1;
      rows.push({
        gymId,
        memberId: member._id,
        membershipId: membership._id ?? null,
        checkIn,
        checkOut,
        status,
        method: dayRng() < 0.85 ? "qr" : "manual",
        scannerId: scanner?._id ?? null,
        notes: null,
        meta: {},
      });
    }
  }

  if (rows.length > 0) await AttendanceRecord.insertMany(rows, { ordered: false });
  return stats;
}

/** Delete notifications pointing at members that no longer exist. */
async function cleanupOrphanNotifications(gymId) {
  const members = await Member.find({ gymId }).lean();
  const ids = new Set(members.map((m) => String(m._id)));
  const scoped = await AppNotification.find({ gymId, memberId: { $ne: null } }).lean();
  const orphanIds = scoped.filter((n) => !ids.has(String(n.memberId))).map((n) => n._id);
  if (orphanIds.length > 0) await AppNotification.deleteMany({ _id: { $in: orphanIds } });
  return orphanIds.length;
}

/** Every active member gets a welcome notification (deduped via dedupeKey). */
async function seedMemberWelcome(gymId) {
  const members = await Member.find({ gymId, status: "active" }).lean();
  let created = 0;
  for (const member of members) {
    const res = await AppNotification.updateOne(
      { gymId, dedupeKey: `welcome:${member._id}` },
      {
        $setOnInsert: {
          memberId: member._id,
          type: "general",
          title: "Welcome to Pulse Gym Suite",
          body: `Hi ${member.fullName} — membership ${member.memberCode} is active. Show your member QR at the front desk to check in.`,
          severity: "info",
          isRead: false,
          dedupeKey: `welcome:${member._id}`,
          link: null,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created += 1;
  }
  return created;
}

async function main() {
  await connectDb(); // .env + the Windows loopback-DNS SRV fallback
  try {
    const now = new Date();
    const gyms = await Gym.find({}).lean();
    let total = 0;
    let rebuilt = 0;
    for (const gym of gyms) {
      const stale = await closeStaleOpen(gym._id, now);
      const stats = await backfillGym(gym, now);
      const orphans = await cleanupOrphanNotifications(gym._id);
      const welcome = await seedMemberWelcome(gym._id);
      total += stats.inserted;
      // Refresh expiry/dues notifications so the panels have real content.
      const ctx = await loadGymContext(gym._id);
      rebuilt += (await rebuildNotifications(gym._id, ctx)) ?? 0;
      console.log(
        `Gym "${gym.name}": closed ${stale} stale open check-ins, +${stats.inserted} records (inside now: ${stats.open}; ` +
          `skipped — already had ${stats.existing}, absent ${stats.absent}, ` +
          `future ${stats.future}, no membership ${stats.noMembership}); ` +
          `notifications: -${orphans} orphan, +${welcome} welcome, ${rebuilt} rebuilt`,
      );
    }
    console.log(`Done. Inserted ${total} attendance records, refreshed ${rebuilt} notifications.`);
  } finally {
    await disconnectDb();
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exitCode = 1;
});
