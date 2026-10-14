import type { UserRole } from "@/types";

/**
 * Client-side capability map.
 *
 * This is a UX guard only (hiding/disabling actions). Authoritative enforcement
 * lives in Postgres: RLS policies + SECURITY DEFINER RPCs re-check the caller's
 * role for every sensitive write.
 */

export type Capability =
  | "members.view"
  | "members.create"
  | "members.edit"
  | "members.delete"
  | "members.export"
  | "qr.scan"
  | "qr.regenerate"
  | "attendance.view"
  | "attendance.correct"
  | "plans.view"
  | "plans.manage"
  | "payments.view"
  | "payments.record"
  | "payments.refund"
  | "staff.view"
  | "staff.manage"
  | "classes.view"
  | "classes.manage"
  | "reports.view"
  | "notifications.view"
  | "notifications.manage"
  | "settings.view"
  | "settings.manage";

const OWNER: Capability[] = [
  "members.view", "members.create", "members.edit", "members.delete", "members.export",
  "qr.scan", "qr.regenerate", "attendance.view", "attendance.correct",
  "plans.view", "plans.manage", "payments.view", "payments.record", "payments.refund",
  "staff.view", "staff.manage", "classes.view", "classes.manage", "reports.view",
  "notifications.view", "notifications.manage", "settings.view", "settings.manage",
];

const FRONT_DESK: Capability[] = [
  "members.view", "members.create", "members.edit", "members.export",
  "qr.scan", "attendance.view", "attendance.correct",
  "plans.view", "payments.view", "payments.record",
  "staff.view", "classes.view", "classes.manage", "reports.view",
  "notifications.view",
];

const TRAINER: Capability[] = [
  "members.view", "plans.view", "attendance.view", "classes.view", "notifications.view",
];

const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  owner: OWNER,
  /** Admins share owner capabilities except destructive member deletion. */
  admin: OWNER.filter((c) => c !== "members.delete"),
  front_desk: FRONT_DESK,
  trainer: TRAINER,
};

/** Roles allowed to record money movements or change financial settings. */
const FINANCIAL_ROLES: UserRole[] = ["owner", "admin"];

export function can(role: UserRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function capabilitiesFor(role: UserRole | null | undefined): Capability[] {
  if (!role) return [];
  return ROLE_CAPABILITIES[role];
}

export function isFinancialAdmin(role: UserRole | null | undefined): boolean {
  return role ? FINANCIAL_ROLES.includes(role) : false;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  front_desk: "Front desk",
  trainer: "Trainer",
};
