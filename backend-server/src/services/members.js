/** Member decoration helpers: attach the current membership + derived status. */

import Member from "../models/Member.js";
import MemberMembership from "../models/MemberMembership.js";
import MembershipPlan from "../models/MembershipPlan.js";
import { toMemberWithMembership } from "../lib/serialize.js";

/** Non-cancelled memberships of a gym grouped by memberId. */
export async function loadMembershipsByMember(gymId, session = null) {
  const rows = await MemberMembership.find({ gymId, status: { $ne: "cancelled" } }).session(session).lean();
  const map = new Map();
  for (const row of rows) {
    const key = String(row.memberId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/** Latest-end membership (mirrors src/lib/membership.ts currentMembership). */
export function pickCurrentMembership(list) {
  if (!list || list.length === 0) return null;
  return [...list].sort((a, b) => (new Date(b.endDate) - new Date(a.endDate) || 0))[0] ?? null;
}

export async function loadPlanMap(gymId, session = null) {
  const plans = await MembershipPlan.find({ gymId }).session(session).lean();
  return new Map(plans.map((p) => [String(p._id), p]));
}

/** Every member of a gym decorated as MemberWithMembership. */
export async function decorateAllMembers(gymId, ctx) {
  const [members, byMember, planById] = await Promise.all([
    Member.find({ gymId }).lean(),
    loadMembershipsByMember(gymId),
    loadPlanMap(gymId),
  ]);
  return members.map((member) => {
    const current = pickCurrentMembership(byMember.get(String(member._id)));
    const plan = current ? planById.get(String(current.planId)) : null;
    return toMemberWithMembership(member, current, plan, ctx);
  });
}

/** One member decorated as MemberWithMembership (null when the member is missing). */
export async function decorateMember(memberDoc, ctx, session = null) {
  if (!memberDoc) return null;
  const rows = await MemberMembership.find({ memberId: memberDoc._id, status: { $ne: "cancelled" } })
    .session(session)
    .lean();
  const current = pickCurrentMembership(rows);
  let plan = null;
  if (current) {
    plan = await MembershipPlan.findById(current.planId).session(session).lean();
  }
  return toMemberWithMembership(memberDoc, current, plan, ctx);
}
